#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
const DEFAULT_REGISTRY = resolve(REPO_ROOT, 'source-media', 'content-library', 'assets.v1.json');
const DEFAULT_CONCEPT_CATALOG = resolve(REPO_ROOT, 'source-media', 'content-library', 'concept-catalog.v1.json');
const DEFAULT_TEXTURE_CATALOG = resolve(REPO_ROOT, 'source-media', 'content-library', 'texture-theme-catalog.v1.json');
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z][a-z0-9_]*$/;
const STYLE_ID_RE = /^[a-z][a-z0-9-]*$/;
const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;
const UNC_RE = /^(?:\\\\|\/\/)[^/\\]/;
const HOME_RE = /^~[\\/]/;
const FILE_URI_RE = /^file:/i;
const CONTENT_CATEGORIES = new Set(['world', 'ship', 'faction', 'character', 'interior', 'prop', 'planet-location', 'vfx-presentation']);
const REPRESENTATIONS = new Set(['3d-model', 'concept-art', 'texture-set', 'vfx-source', 'ui-source', 'audio-source']);
const FACTIONS = new Set(['uga', 'nova', 'dominion', 'syndicate', 'brood']);
const BIOMES = new Set([
  'verdant', 'ashland', 'arctic', 'vespera', 'uga_ship_biodome', 'uga_ship_interior',
  'uga_ship_research_industrial', 'uga_ship_science_observatory', 'uga_ship_expedition_staging',
  'aelos_north', 'aelos_basin', 'aelos_coast', 'aelos_ridge',
  'pyraeth_crater', 'pyraeth_belt', 'pyraeth_caldera', 'pyraeth_flats',
  'nordhall_isles', 'nordhall_cliff', 'nordhall_frost', 'nordhall_peaks',
  'vespera_spire', 'vespera_dunes', 'vespera_refinery', 'vespera_plateau',
  'volcanic', 'alien_jungle', 'cyber_purple', 'golden_jade', 'terrestrial', 'gas',
  'orbital_arcology', 'relay_superstructure', 'industrial_station', 'derelict_megaframe',
  'gravitic_observatory', 'ancient_subsurface', 'abandoned_colony', 'subterranean_transit', 'brood_hive_depths'
]);
const INTENTIONS = new Set([
  'combat-unit', 'production-structure', 'civic-exploration-space', 'navigation-prop',
  'world-landmark', 'resource-site', 'cinematic-character', 'damage-state',
  'ship-layout', 'interior-kit', 'environment-material-language', 'vfx-presentation',
  'ship-crew', 'commander-icon-source', 'cliff-rock-kit', 'flora-kit',
  'destructible-cover', 'road-bridge-kit', 'civic-ruin', 'crater-scorch-insert',
  'ship-resident', 'playable-commander', 'humanoid-personnel', 'strike-team-roster'
]);
const CAMERAS = new Set(['orthographic-multi-view', 'isometric-cutaway', 'tactical-rts', 'tilted-top-down-mobile-rts', 'material-board', 'character-turnaround', 'portrait-three-quarter']);
const SCALES = new Set(['capital-ship', 'room-and-human', 'battlefield-region', 'human-full-body', 'combat-unit', 'structure-family', 'navigation-prop', 'planetary-landmark', 'vfx-event']);
const LOD_PROFILES = new Set(['ship-hub-static', 'interior-modular', 'terrain-material-kit', 'world-modular-kit', 'character-cinematic', 'rts-instanced', 'prop-standard', 'planet-location', 'vfx-tiered']);
const RUNTIME_CONSUMERS = new Set(['main-rts', 'space-exploration-module', 'cinematic-pipeline', 'commander-portrait', 'content-authoring']);
const PRODUCTION_BIOMES = new Set([
  'ship-civic-biodome', 'ship-research-industrial', 'ship-expedition-staging',
  'verdant', 'arctic', 'ashland', 'vespera'
]);
const PRODUCTION_FACTIONS = new Set(['uga', 'nova', 'dominion', 'syndicate', 'brood', 'faction-neutral']);
const MODEL_INTENTIONS = new Set([
  'hero-landmark', 'modular-kit', 'infrastructure', 'character', 'vehicle-creature',
  'damage-state', 'lod-silhouette', 'environment-terrain'
]);
const FORCE_RELATIONSHIP_ROLES = new Set(['uga-institutional', 'resident-playable', 'faction-neutral', 'hostile-ai']);
const BROOD_FORBIDDEN_INTENTIONS = new Set(['ship-crew', 'ship-resident', 'playable-commander', 'humanoid-personnel', 'strike-team-roster', 'commander-icon-source']);
const TEXTURE_DOMAINS = new Set(['MAP', 'CITY', 'SHIP_SECTION']);
const TEXTURE_MATERIAL_ROLES = new Set([
  'terrain-ground', 'terrain-soil-rock', 'terrain-paving', 'location-accent',
  'architecture-facade', 'architecture-roof', 'architecture-contact',
  'interior-floor', 'interior-wall', 'interior-machinery'
]);
const TEXTURE_TARGET_IDS = [
  'map_theme_verdant', 'map_theme_arctic', 'map_theme_ashland', 'map_theme_vespera',
  'map_location_aelos_north', 'map_location_aelos_basin', 'map_location_aelos_coast', 'map_location_aelos_ridge',
  'map_location_pyraeth_crater', 'map_location_pyraeth_belt', 'map_location_pyraeth_caldera', 'map_location_pyraeth_flats',
  'map_location_nordhall_isles', 'map_location_nordhall_cliff', 'map_location_nordhall_frost', 'map_location_nordhall_peaks',
  'map_location_vespera_spire', 'map_location_vespera_dunes', 'map_location_vespera_refinery', 'map_location_vespera_plateau',
  'city_faction_neutral_civic', 'city_nova_contact', 'city_dominion_contact', 'city_syndicate_contact', 'city_brood_hostile_contact',
  'ship_section_command_navigation_ops', 'ship_section_survey_research', 'ship_section_fabrication_engineering',
  'ship_section_habitat_embassy', 'ship_section_strike_bay_logistics'
];
const TEXTURE_MOBILE_VIEWPORTS = ['phone-portrait', 'phone-landscape'];
const TEXTURE_MOBILE_REQUIREMENTS = ['no-visible-seams', 'no-distance-shimmer', 'readable-texel-scale', 'matched-before-after'];
const TEXTURE_DOMAIN_BUDGET = {
  MAP_BASE: { anisotropyClass: 'terrain-primary', strategy: 'current-map-only' },
  MAP_LOCATION: { anisotropyClass: 'location-overlay', strategy: 'current-location-overlay' },
  CITY: { anisotropyClass: 'world-architecture', strategy: 'current-city-family-only' },
  SHIP_SECTION: { anisotropyClass: 'ship-interior', strategy: 'current-ship-section-only' }
};
const TEXTURE_ROLE_SCALE = {
  'terrain-ground': [16, 128],
  'terrain-soil-rock': [8, 256],
  'terrain-paving': [4, 512],
  'location-accent': [8, 256],
  'architecture-facade': [4, 512],
  'architecture-roof': [4, 512],
  'architecture-contact': [8, 256],
  'interior-floor': [2, 1024],
  'interior-wall': [2, 1024],
  'interior-machinery': [1, 2048]
};
const TEXTURE_REGION_AXES = {
  aelos_north: { themes: ['verdant'], faction: ['nova'] },
  aelos_basin: { themes: ['verdant'], faction: ['nova'] },
  aelos_coast: { themes: ['verdant'], faction: ['nova'] },
  aelos_ridge: { themes: ['arctic'], faction: ['nova'] },
  pyraeth_crater: { themes: ['vespera', 'ashland'], faction: ['dominion'] },
  pyraeth_belt: { themes: ['vespera'], faction: ['dominion'] },
  pyraeth_caldera: { themes: ['vespera'], faction: ['dominion'] },
  pyraeth_flats: { themes: ['vespera'], faction: ['dominion'] },
  nordhall_isles: { themes: ['arctic'], faction: ['syndicate'] },
  nordhall_cliff: { themes: ['arctic'], faction: ['syndicate'] },
  nordhall_frost: { themes: ['arctic'], faction: ['syndicate'] },
  nordhall_peaks: { themes: ['arctic'], faction: ['syndicate'] },
  vespera_spire: { themes: ['ashland'], faction: ['brood'] },
  vespera_dunes: { themes: ['ashland'], faction: ['brood'] },
  vespera_refinery: { themes: ['ashland'], faction: ['brood'] },
  vespera_plateau: { themes: ['verdant', 'ashland'], faction: ['brood'] }
};
const TEXTURE_CITY_AXES = {
  city_faction_neutral_civic: { locations: [], factions: ['faction-neutral'] },
  city_nova_contact: { locations: ['aelos_north', 'aelos_basin', 'aelos_coast', 'aelos_ridge'], factions: ['nova'] },
  city_dominion_contact: { locations: ['pyraeth_crater', 'pyraeth_belt', 'pyraeth_caldera', 'pyraeth_flats'], factions: ['dominion'] },
  city_syndicate_contact: { locations: ['nordhall_isles', 'nordhall_cliff', 'nordhall_frost', 'nordhall_peaks'], factions: ['syndicate'] },
  city_brood_hostile_contact: { locations: ['vespera_spire', 'vespera_dunes', 'vespera_refinery', 'vespera_plateau'], factions: ['brood'] }
};
const TEXTURE_SHIP_AXES = {
  ship_section_command_navigation_ops: { section: ['command_navigation_ops'], districts: ['command', 'navigation', 'mission_ops'], factions: ['uga'] },
  ship_section_survey_research: { section: ['survey_research'], districts: ['survey', 'research'], factions: ['uga'] },
  ship_section_fabrication_engineering: { section: ['fabrication_engineering'], districts: ['fabricator', 'engineering'], factions: ['uga'] },
  ship_section_habitat_embassy: { section: ['habitat_embassy'], districts: ['habitat', 'factions'], factions: ['uga', 'nova', 'dominion', 'syndicate'] },
  ship_section_strike_bay_logistics: { section: ['strike_bay_logistics'], districts: ['hangar', 'logistics'], factions: ['uga', 'nova', 'dominion', 'syndicate'] }
};

function issue(level, code, location, message) {
  return { level, code, location, message };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isAbsoluteLocalReference(value) {
  if (typeof value !== 'string') return false;
  if (/^https?:\/\//i.test(value)) return false;
  return isAbsolute(value) || WINDOWS_ABSOLUTE_RE.test(value) || UNC_RE.test(value) || HOME_RE.test(value) || FILE_URI_RE.test(value);
}

function findAbsoluteLocalReferences(value, location, output) {
  if (typeof value === 'string') {
    if (isAbsoluteLocalReference(value)) output.push({ location, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findAbsoluteLocalReferences(entry, `${location}[${index}]`, output));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    findAbsoluteLocalReferences(entry, `${location}.${key}`, output);
  }
}

function isRelativeRepoPath(value) {
  return typeof value === 'string' && value.length > 0 && !isAbsoluteLocalReference(value) && !value.includes('..') && !value.includes('\\');
}

function validateEvidenceFile(absolutePath, evidence, at, errors) {
  const data = readFileSync(absolutePath);
  if (SHA256_RE.test(evidence?.integrity?.digest ?? '')) {
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== evidence.integrity.digest) errors.push(issue('error', 'CONCEPT_HASH_MISMATCH', `${at}.integrity.digest`, `Expected ${evidence.integrity.digest}; found ${actual}.`));
  }
  if (Number.isInteger(evidence?.bytes) && data.length !== evidence.bytes) {
    errors.push(issue('error', 'CONCEPT_BYTE_SIZE_MISMATCH', `${at}.bytes`, `Expected ${evidence.bytes} bytes; found ${data.length}.`));
  }
  if (Array.isArray(evidence?.resolution) && evidence.resolution.length === 2 && data.length >= 24 && data.subarray(1, 4).toString('ascii') === 'PNG') {
    const actual = [data.readUInt32BE(16), data.readUInt32BE(20)];
    if (actual[0] !== evidence.resolution[0] || actual[1] !== evidence.resolution[1]) {
      errors.push(issue('error', 'CONCEPT_RESOLUTION_MISMATCH', `${at}.resolution`, `Expected ${evidence.resolution.join('x')}; found ${actual.join('x')}.`));
    }
  }
}

function validateControlledArray(value, allowed, at, code, errors, options = {}) {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    errors.push(issue('error', code, at, `Expected ${options.allowEmpty ? 'an' : 'a non-empty'} array.`));
    return;
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    if (!allowed.has(entry)) errors.push(issue('error', code, `${at}[${index}]`, `Unsupported controlled-vocabulary value ${String(entry)}.`));
    if (seen.has(entry)) errors.push(issue('error', `${code}_DUPLICATE`, `${at}[${index}]`, `Duplicate value ${String(entry)}.`));
    seen.add(entry);
  });
}

function validateClassification(classification, at, errors) {
  if (!isObject(classification)) {
    errors.push(issue('error', 'CLASSIFICATION_MISSING', at, 'Classification is required.'));
    return;
  }
  validateControlledArray(classification.biomeOrBiodome, BIOMES, `${at}.biomeOrBiodome`, 'BIOME_CLASSIFICATION_INVALID', errors, { allowEmpty: true });
  validateControlledArray(classification.faction, FACTIONS, `${at}.faction`, 'FACTION_CLASSIFICATION_INVALID', errors, { allowEmpty: true });
  validateControlledArray(classification.intention, INTENTIONS, `${at}.intention`, 'INTENTION_CLASSIFICATION_INVALID', errors);
}

function validateProductionAxes(record, at, errors, planned) {
  const scope = record?.coverageScope;
  if (!['production-matrix', 'outside-production-matrix'].includes(scope)) {
    errors.push(issue('error', planned ? 'PLANNED_PRODUCTION_SCOPE_INVALID' : 'APPROVED_PRODUCTION_SCOPE_INVALID', `${at}.coverageScope`, 'Records must explicitly declare whether they participate in the narrow production matrix.'));
    return;
  }
  if (scope === 'outside-production-matrix') {
    if (record.productionAxes !== undefined) {
      errors.push(issue('error', 'OUTSIDE_MATRIX_AXES_FORBIDDEN', `${at}.productionAxes`, 'Out-of-matrix records cannot claim narrow production coverage axes.'));
    }
    if (!planned && (!Array.isArray(record?.classification?.biomeOrBiodome) || record.classification.biomeOrBiodome.length === 0 || !Array.isArray(record?.classification?.faction) || record.classification.faction.length === 0)) {
      errors.push(issue('error', 'OUTSIDE_MATRIX_CLASSIFICATION_REQUIRED', `${at}.classification`, 'Approved out-of-matrix modeling references must retain non-empty canonical biome/biodome and faction axes.'));
    }
    return;
  }
  const axes = record?.productionAxes;
  if (!isObject(axes)) {
    errors.push(issue('error', 'PRODUCTION_AXES_REQUIRED', `${at}.productionAxes`, 'Production biome/biodome, faction, and model-intention axes are required.'));
    return;
  }
  validateControlledArray(axes.biomeOrBiodome, PRODUCTION_BIOMES, `${at}.productionAxes.biomeOrBiodome`, 'PRODUCTION_BIOME_INVALID', errors);
  validateControlledArray(axes.faction, PRODUCTION_FACTIONS, `${at}.productionAxes.faction`, 'PRODUCTION_FACTION_INVALID', errors);
  validateControlledArray(axes.modelIntention, MODEL_INTENTIONS, `${at}.productionAxes.modelIntention`, 'PRODUCTION_MODEL_INTENTION_INVALID', errors);
}

function validateForceRelationshipRole(record, at, errors, planned) {
  validateControlledArray(record?.forceRelationshipRole, FORCE_RELATIONSHIP_ROLES, `${at}.forceRelationshipRole`, 'FORCE_RELATIONSHIP_ROLE_INVALID', errors);
  const factions = new Set([
    ...(Array.isArray(record?.classification?.faction) ? record.classification.faction : []),
    ...(Array.isArray(record?.productionAxes?.faction) ? record.productionAxes.faction : [])
  ]);
  const expected = new Set();
  if (factions.has('uga')) expected.add('uga-institutional');
  if (['nova', 'dominion', 'syndicate'].some((faction) => factions.has(faction))) expected.add('resident-playable');
  if (factions.has('brood')) expected.add('hostile-ai');
  if (factions.has('faction-neutral')) expected.add('faction-neutral');
  const actual = new Set(Array.isArray(record?.forceRelationshipRole) ? record.forceRelationshipRole : []);
  const missing = [...expected].filter((role) => !actual.has(role));
  const extra = [...actual].filter((role) => !expected.has(role));
  if (missing.length > 0 || extra.length > 0) {
    errors.push(issue('error', 'FORCE_RELATIONSHIP_ROLE_MISMATCH', `${at}.forceRelationshipRole`, `Role mapping must match declared factions; missing=[${missing.join(',')}], extra=[${extra.join(',')}].`));
  }
  if (factions.has('brood')) {
    const forbidden = (record?.classification?.intention ?? []).filter((intention) => BROOD_FORBIDDEN_INTENTIONS.has(intention));
    if (forbidden.length > 0) errors.push(issue('error', 'BROOD_FORBIDDEN_INTENTION', `${at}.classification.intention`, `Brood is hostile AI and cannot carry resident/playable/humanoid intentions: ${forbidden.join(', ')}.`));
    if (record?.productionAxes?.modelIntention?.includes('character')) errors.push(issue('error', 'BROOD_CHARACTER_AXIS_FORBIDDEN', `${at}.productionAxes.modelIntention`, 'Brood is non-humanoid hostile AI and cannot receive character production coverage.'));
    const shipRosterTarget = record?.productionAxes?.faction?.includes('brood') && record.productionAxes.biomeOrBiodome?.some((biome) => biome === 'ship-civic-biodome' || biome === 'ship-expedition-staging');
    if (shipRosterTarget) errors.push(issue('error', 'BROOD_SHIP_ROSTER_FORBIDDEN', `${at}.productionAxes`, 'Brood cannot receive routine ship-resident or Strike-Team production coverage.'));
  }
  const disposition = record?.canonicalDisposition;
  if (!planned && record?.status === 'REJECTED') {
    const validBrief = typeof disposition?.replacementBriefId === 'string' && ID_RE.test(disposition.replacementBriefId);
    const validConcept = typeof disposition?.replacementConceptId === 'string' && ID_RE.test(disposition.replacementConceptId);
    if (!isObject(disposition) || disposition.status !== 'SUPERSEDED_REJECTED' || typeof disposition.reason !== 'string' || disposition.reason.trim().length === 0 || validBrief === validConcept) {
      errors.push(issue('error', 'REJECTED_CANONICAL_DISPOSITION_REQUIRED', `${at}.canonicalDisposition`, 'Rejected concepts require a superseded/rejected reason and exactly one replacement brief or approved concept id.'));
    }
  } else if (disposition !== undefined) {
    errors.push(issue('error', 'CANONICAL_DISPOSITION_UNEXPECTED', `${at}.canonicalDisposition`, 'Only rejected concepts can carry a rejected canonical disposition.'));
  }
}

function validateFacePolicy(asset, at, errors) {
  const face = asset?.facePolicy;
  if (!isObject(face) || !isObject(face.faceAnimation)) {
    errors.push(issue('error', 'CHARACTER_FACE_POLICY_MISSING', `${at}.facePolicy`, 'Character assets require an explicit face policy.'));
    return;
  }
  const animation = face.faceAnimation;
  const animationBooleans = ['enabled', 'facialRig', 'morphTargets', 'lipSync', 'expressions'];
  for (const field of animationBooleans) {
    if (typeof animation[field] !== 'boolean') errors.push(issue('error', 'CHARACTER_FACE_DECLARATION_INVALID', `${at}.facePolicy.faceAnimation.${field}`, `${field} must be explicitly true or false.`));
  }
  if (!isObject(animation.closeUpQa) || !['not-applicable', 'pending', 'verified', 'failed'].includes(animation.closeUpQa.status)) {
    errors.push(issue('error', 'CHARACTER_FACE_QA_INVALID', `${at}.facePolicy.faceAnimation.closeUpQa`, 'Close-up QA status must be explicitly declared.'));
  }
  const sealed = face.presentation === 'sealed-helmet' || face.presentation === 'opaque-mask';
  const visible = ['visible-face', 'open-helmet', 'transparent-visor'].includes(face.presentation);
  if (animation.enabled === false && !sealed) {
    errors.push(issue('error', 'VISIBLE_FACE_ANIMATION_REQUIRED', `${at}.facePolicy`, 'Disabled facial animation requires an opaque sealed helmet or opaque mask.'));
  }
  if (visible) {
    const declarationsComplete = animation.enabled === true && animation.facialRig === true && animation.morphTargets === true &&
      animation.lipSync === true && animation.expressions === true && animation.closeUpQa?.status === 'verified' &&
      typeof animation.closeUpQa?.evidence === 'string' && animation.closeUpQa.evidence.trim().length > 0;
    if (!declarationsComplete) {
      errors.push(issue('error', 'VISIBLE_FACE_ANIMATION_REQUIRED', `${at}.facePolicy`, 'Visible faces require facial rig, morph targets, lip-sync, expressions, and verified close-up QA evidence.'));
    }
  }
}

function validateConceptEvidence(asset, at, runtimeApproval, errors) {
  const concept = asset?.conceptEvidence;
  if (!isObject(concept)) {
    errors.push(issue('error', runtimeApproval ? 'RUNTIME_CONCEPT_REQUIRED' : 'MODEL_CONCEPT_REQUIRED', `${at}.conceptEvidence`, '3D model assets require linked concept evidence.'));
    return;
  }
  const localReferences = [];
  findAbsoluteLocalReferences(concept, `${at}.conceptEvidence`, localReferences);
  for (const ref of localReferences) errors.push(issue('error', 'ABSOLUTE_CONCEPT_PATH', ref.location, `Machine-local concept evidence is forbidden: ${ref.value}`));
  if (concept.sourceOnly !== true || concept.pixelUsage !== 'concept-reference-only' || concept.pixelsUsedAsTexture !== false) {
    errors.push(issue('error', 'CONCEPT_PIXEL_POLICY_INVALID', `${at}.conceptEvidence`, 'Concepts must remain source-only reference art and their pixels cannot be runtime textures.'));
  }
  if (typeof concept.conceptId !== 'string' || !ID_RE.test(concept.conceptId)) errors.push(issue('error', 'CONCEPT_ID_INVALID', `${at}.conceptEvidence.conceptId`, 'Concept id must be lower_snake_case.'));
  if (!isRelativeRepoPath(concept.plannedPath)) errors.push(issue('error', 'CONCEPT_PLANNED_PATH_INVALID', `${at}.conceptEvidence.plannedPath`, 'Concept planned path must be repository-relative.'));
  if (concept.sourcePath !== null && !isRelativeRepoPath(concept.sourcePath)) errors.push(issue('error', 'CONCEPT_SOURCE_PATH_INVALID', `${at}.conceptEvidence.sourcePath`, 'Concept source path must be null or repository-relative.'));
  if (concept.integrity?.algorithm !== 'sha256' || !['pending', 'verified', 'mismatch'].includes(concept.integrity?.status) ||
      (concept.integrity?.digest !== null && !SHA256_RE.test(concept.integrity?.digest ?? '')) ||
      (concept.integrity?.status === 'verified' && !SHA256_RE.test(concept.integrity?.digest ?? ''))) {
    errors.push(issue('error', 'CONCEPT_INTEGRITY_INVALID', `${at}.conceptEvidence.integrity`, 'Concept integrity must use SHA-256 with a valid pending or verified digest state.'));
  }
  if (runtimeApproval) {
    if (!isRelativeRepoPath(concept.sourcePath)) errors.push(issue('error', 'RUNTIME_CONCEPT_PATH_REQUIRED', `${at}.conceptEvidence.sourcePath`, 'Approved runtime models require an ingested repository-relative concept path.'));
    if (concept.integrity?.status !== 'verified' || !SHA256_RE.test(concept.integrity?.digest ?? '')) errors.push(issue('error', 'RUNTIME_CONCEPT_HASH_REQUIRED', `${at}.conceptEvidence.integrity`, 'Approved runtime models require a verified concept SHA-256.'));
    if (concept.approvalStatus !== 'APPROVED') errors.push(issue('error', 'RUNTIME_CONCEPT_APPROVAL_REQUIRED', `${at}.conceptEvidence.approvalStatus`, 'Concept approval must be APPROVED before runtime model approval.'));
  }
}

function validateSourceDisposition(asset, at, errors) {
  const disposition = asset?.sourceDisposition;
  if (disposition === undefined) return;
  if (!isObject(disposition) || !['authoring-source', 'reference-only'].includes(disposition.usage)) {
    errors.push(issue('error', 'SOURCE_DISPOSITION_INVALID', `${at}.sourceDisposition`, 'Source disposition must explicitly identify authoring-source or reference-only use.'));
    return;
  }
  if (typeof disposition.runtimeEligible !== 'boolean' || typeof disposition.automaticDecimationAllowed !== 'boolean' ||
      typeof disposition.reason !== 'string' || typeof disposition.topologyFinding !== 'string' ||
      typeof disposition.evidence !== 'string' || typeof disposition.rebuildFromConceptId !== 'string') {
    errors.push(issue('error', 'SOURCE_DISPOSITION_INVALID', `${at}.sourceDisposition`, 'Source disposition requires explicit eligibility, decimation, reason, topology, evidence, and rebuild concept declarations.'));
  }
  if (disposition.usage === 'reference-only') {
    if (disposition.runtimeEligible !== false || disposition.automaticDecimationAllowed !== false || disposition.reason !== 'clean-rebuild-required') {
      errors.push(issue('error', 'REFERENCE_ONLY_POLICY_INVALID', `${at}.sourceDisposition`, 'Reference-only sources must be runtime-ineligible, reject automatic decimation, and require a clean rebuild.'));
    }
    if (asset?.lifecycle?.runtimeReady === true || asset?.approval?.status === 'APPROVED') {
      errors.push(issue('error', 'REFERENCE_ONLY_RUNTIME_FORBIDDEN', at, 'A rejected reference-only mesh cannot be promoted to runtime; create a clean rebuilt asset record instead.'));
    }
    if (asset?.approval?.status !== 'REJECTED') {
      errors.push(issue('error', 'REFERENCE_ONLY_REJECTION_REQUIRED', `${at}.approval.status`, 'Reference-only topology must retain REJECTED asset approval.'));
    }
    if (disposition.rebuildFromConceptId !== asset?.conceptEvidence?.conceptId) {
      errors.push(issue('error', 'REFERENCE_REBUILD_CONCEPT_MISMATCH', `${at}.sourceDisposition.rebuildFromConceptId`, 'Clean rebuild concept must match linked concept evidence.'));
    }
  }
}

function validateTriangleRanges(asset, at, errors) {
  const ranges = asset?.runtime?.lodTargets;
  if (!isObject(ranges)) {
    errors.push(issue('error', 'LOD_TARGETS_MISSING', `${at}.runtime.lodTargets`, 'LOD0, LOD1, and LOD2 triangle ranges are required.'));
    return;
  }
  const ordered = ['LOD0', 'LOD1', 'LOD2'];
  for (const lod of ordered) {
    const range = ranges[lod];
    if (!isObject(range) || !Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 1 || range.max < range.min) {
      errors.push(issue('error', 'LOD_RANGE_INVALID', `${at}.runtime.lodTargets.${lod}`, 'LOD range must use positive integer min/max values with max >= min.'));
    }
  }
  if (errors.some((entry) => entry.location.startsWith(`${at}.runtime.lodTargets`))) return;
  if (ranges.LOD0.min <= ranges.LOD1.max || ranges.LOD1.min <= ranges.LOD2.max) {
    errors.push(issue('error', 'LOD_ORDER_INVALID', `${at}.runtime.lodTargets`, 'LOD triangle ranges must be strictly descending and non-overlapping.'));
  }
  if (Number.isInteger(asset?.geometry?.sourceTriangles) && asset.geometry.sourceTriangles <= ranges.LOD0.max) {
    errors.push(issue('error', 'SOURCE_NOT_ABOVE_LOD0', `${at}.geometry.sourceTriangles`, 'A reducible source mesh must exceed the LOD0 maximum.'));
  }
}

function validateGateSet(asset, at, errors) {
  const gates = asset?.approval?.gates;
  if (!Array.isArray(gates) || gates.length === 0) {
    errors.push(issue('error', 'GATES_MISSING', `${at}.approval.gates`, 'At least one promotion gate is required.'));
    return;
  }
  const gateIds = new Set();
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    const gateAt = `${at}.approval.gates[${index}]`;
    if (!isObject(gate) || typeof gate.id !== 'string' || typeof gate.status !== 'string') {
      errors.push(issue('error', 'GATE_INVALID', gateAt, 'Each gate requires an id and status.'));
      continue;
    }
    if (gateIds.has(gate.id)) errors.push(issue('error', 'GATE_DUPLICATE', `${gateAt}.id`, `Duplicate gate id ${gate.id}.`));
    gateIds.add(gate.id);
  }
  if (asset?.lifecycle?.runtimeReady === true) {
    for (const gate of gates) {
      if (gate.status !== 'verified' && gate.status !== 'not-applicable') {
        errors.push(issue('error', 'RUNTIME_GATE_OPEN', `${at}.approval.gates`, `Runtime-ready asset still has open gate ${gate.id}.`));
      }
    }
  }
}

function validateAsset(asset, index, styleIds, options, errors, warnings) {
  const at = `assets[${index}]`;
  if (!isObject(asset)) {
    errors.push(issue('error', 'ASSET_INVALID', at, 'Asset entry must be an object.'));
    return;
  }
  if (typeof asset.id !== 'string' || !ID_RE.test(asset.id)) {
    errors.push(issue('error', 'ASSET_ID_INVALID', `${at}.id`, 'Asset id must be lower_snake_case.'));
  }
  if (!REPRESENTATIONS.has(asset.representation)) errors.push(issue('error', 'REPRESENTATION_INVALID', `${at}.representation`, 'Unsupported asset representation.'));
  if (!CONTENT_CATEGORIES.has(asset.contentCategory)) errors.push(issue('error', 'CONTENT_CATEGORY_INVALID', `${at}.contentCategory`, 'Unsupported content category.'));
  validateClassification(asset.classification, `${at}.classification`, errors);
  if (!styleIds.has(asset.styleProfile)) {
    errors.push(issue('error', 'STYLE_PROFILE_UNKNOWN', `${at}.styleProfile`, `Unknown style profile ${String(asset.styleProfile)}.`));
  }
  if (!['SOURCE', 'DERIVED', 'RUNTIME'].includes(asset?.lifecycle?.stage)) {
    errors.push(issue('error', 'STAGE_INVALID', `${at}.lifecycle.stage`, 'Stage must be SOURCE, DERIVED, or RUNTIME.'));
  }
  if (typeof asset?.lifecycle?.runtimeReady !== 'boolean') {
    errors.push(issue('error', 'RUNTIME_READY_INVALID', `${at}.lifecycle.runtimeReady`, 'runtimeReady must be boolean.'));
  }
  const sourcePath = asset?.source?.path;
  if (typeof sourcePath !== 'string' || sourcePath.length === 0 || isAbsoluteLocalReference(sourcePath) || sourcePath.includes('..') || sourcePath.includes('\\')) {
    errors.push(issue('error', 'SOURCE_PATH_INVALID', `${at}.source.path`, 'Source path must be a repository-relative POSIX path without traversal.'));
  }
  const localReferences = [];
  findAbsoluteLocalReferences(asset?.source?.provenance, `${at}.source.provenance`, localReferences);
  for (const ref of localReferences) {
    errors.push(issue('error', 'ABSOLUTE_PROVENANCE_PATH', ref.location, `Machine-local provenance is forbidden: ${ref.value}`));
  }
  const integrity = asset?.source?.provenance?.integrity;
  if (!isObject(integrity) || integrity.algorithm !== 'sha256' || !['pending', 'verified', 'mismatch'].includes(integrity.status)) {
    errors.push(issue('error', 'INTEGRITY_INVALID', `${at}.source.provenance.integrity`, 'Integrity must declare sha256 and a valid status.'));
  } else {
    if (integrity.status === 'verified' && !SHA256_RE.test(integrity.digest ?? '')) {
      errors.push(issue('error', 'INTEGRITY_DIGEST_INVALID', `${at}.source.provenance.integrity.digest`, 'Verified integrity requires a lowercase 64-character SHA-256 digest.'));
    }
    if (integrity.digest !== null && !SHA256_RE.test(integrity.digest ?? '')) {
      errors.push(issue('error', 'INTEGRITY_DIGEST_INVALID', `${at}.source.provenance.integrity.digest`, 'Digest must be null or a lowercase 64-character SHA-256 value.'));
    }
  }

  if (asset.assetType === 'character') {
    if (asset?.geometry?.fullBody !== true || asset?.geometry?.bindPose !== 'strict-t-pose') {
      errors.push(issue('error', 'CHARACTER_POSE_INVALID', `${at}.geometry`, 'Character source candidates must explicitly record full-body strict T-pose intake.'));
    }
    if (!Number.isInteger(asset?.geometry?.sourceTriangles) || asset.geometry.sourceTriangles < 1) {
      errors.push(issue('error', 'SOURCE_TRIANGLES_INVALID', `${at}.geometry.sourceTriangles`, 'Character source triangle count must be a positive integer.'));
    }
    if (asset?.capabilities?.rigged !== true && Array.isArray(asset?.capabilities?.animationClips) && asset.capabilities.animationClips.length > 0) {
      errors.push(issue('error', 'ANIMATION_WITHOUT_RIG', `${at}.capabilities`, 'Animation clips cannot be claimed when rigged is false.'));
    }
    validateFacePolicy(asset, at, errors);
  }

  validateTriangleRanges(asset, at, errors);
  validateGateSet(asset, at, errors);

  const runtimeReady = asset?.lifecycle?.runtimeReady === true;
  const runtimeApproval = runtimeReady || asset?.approval?.status === 'APPROVED';
  if (asset.representation === '3d-model') validateConceptEvidence(asset, at, runtimeApproval, errors);
  validateSourceDisposition(asset, at, errors);
  if (runtimeReady) {
    if (asset?.lifecycle?.stage !== 'RUNTIME') errors.push(issue('error', 'RUNTIME_STAGE_REQUIRED', `${at}.lifecycle.stage`, 'Runtime-ready assets must use RUNTIME stage.'));
    if (asset?.approval?.status !== 'APPROVED') errors.push(issue('error', 'RUNTIME_APPROVAL_REQUIRED', `${at}.approval.status`, 'Runtime-ready assets must be APPROVED.'));
    if (integrity?.status !== 'verified') errors.push(issue('error', 'RUNTIME_INTEGRITY_REQUIRED', `${at}.source.provenance.integrity`, 'Runtime-ready assets require verified source integrity.'));
    if (typeof asset?.runtime?.runtimePath !== 'string' || isAbsoluteLocalReference(asset.runtime.runtimePath)) {
      errors.push(issue('error', 'RUNTIME_PATH_REQUIRED', `${at}.runtime.runtimePath`, 'Runtime-ready assets require a repository-relative runtime path.'));
    }
    if (asset.assetType === 'character' && asset?.capabilities?.rigged !== true) {
      errors.push(issue('error', 'RUNTIME_CHARACTER_RIG_REQUIRED', `${at}.capabilities.rigged`, 'Runtime-ready animated characters must have a verified rig.'));
    }
  } else if (asset?.approval?.status === 'APPROVED') {
    errors.push(issue('error', 'APPROVED_NOT_RUNTIME_READY', `${at}.approval.status`, 'APPROVED is reserved for runtime-ready assets; use REVIEW for pre-runtime approval.'));
  }

  if (integrity?.status === 'pending') {
    warnings.push(issue('warning', 'SOURCE_HASH_PENDING', `${at}.source.provenance.integrity`, 'Source is inventoried but cannot be promoted until SHA-256 integrity is verified.'));
  }

  if (options.checkFiles && typeof sourcePath === 'string' && !isAbsoluteLocalReference(sourcePath)) {
    const absoluteSource = resolve(options.repoRoot, sourcePath);
    if (!absoluteSource.startsWith(`${options.repoRoot}\\`) && absoluteSource !== options.repoRoot) {
      errors.push(issue('error', 'SOURCE_ESCAPES_REPO', `${at}.source.path`, 'Resolved source path escapes the repository.'));
    } else if (!existsSync(absoluteSource)) {
      const severity = runtimeReady ? 'error' : 'warning';
      const target = severity === 'error' ? errors : warnings;
      target.push(issue(severity, 'SOURCE_FILE_MISSING', `${at}.source.path`, `Source file is not present: ${sourcePath}`));
    } else if (SHA256_RE.test(integrity?.digest ?? '')) {
      const actual = createHash('sha256').update(readFileSync(absoluteSource)).digest('hex');
      if (actual !== integrity.digest) errors.push(issue('error', 'SOURCE_HASH_MISMATCH', `${at}.source.provenance.integrity.digest`, `Expected ${integrity.digest}; found ${actual}.`));
    }
  }
  const conceptPath = asset?.conceptEvidence?.sourcePath;
  const conceptIntegrity = asset?.conceptEvidence?.integrity;
  if (options.checkFiles && typeof conceptPath === 'string' && isRelativeRepoPath(conceptPath)) {
    const absoluteConcept = resolve(options.repoRoot, conceptPath);
    if (!existsSync(absoluteConcept)) {
      const target = runtimeApproval ? errors : warnings;
      target.push(issue(runtimeApproval ? 'error' : 'warning', 'CONCEPT_FILE_MISSING', `${at}.conceptEvidence.sourcePath`, `Concept file is not present: ${conceptPath}`));
    } else if (SHA256_RE.test(conceptIntegrity?.digest ?? '')) {
      validateEvidenceFile(absoluteConcept, asset.conceptEvidence, `${at}.conceptEvidence`, errors);
    }
  }
}

function validateConceptShape(record, index, planned, options, errors, warnings) {
  const collection = planned ? 'plannedBriefs' : 'concepts';
  const at = `${collection}[${index}]`;
  if (!isObject(record)) {
    errors.push(issue('error', planned ? 'PLANNED_BRIEF_INVALID' : 'CONCEPT_INVALID', at, 'Record must be an object.'));
    return;
  }
  if (typeof record.id !== 'string' || !ID_RE.test(record.id)) errors.push(issue('error', 'CONCEPT_ID_INVALID', `${at}.id`, 'Concept id must be lower_snake_case.'));
  if (!CONTENT_CATEGORIES.has(record.contentCategory)) errors.push(issue('error', 'CONCEPT_CATEGORY_INVALID', `${at}.contentCategory`, 'Unsupported concept category.'));
  if (record.contentSubtype !== undefined && (typeof record.contentSubtype !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(record.contentSubtype))) {
    errors.push(issue('error', 'CONCEPT_SUBTYPE_INVALID', `${at}.contentSubtype`, 'Concept subtype must use a dotted lowercase taxonomy path.'));
  }
  validateClassification(record.classification, `${at}.classification`, errors);
  validateProductionAxes(record, at, errors, planned);
  validateForceRelationshipRole(record, at, errors, planned);
  if (record.contentCategory === 'character') {
    const contract = record.characterContract;
    const requiredViews = ['front', 'left-side', 'back', 'three-quarter'];
    const viewsComplete = Array.isArray(contract?.views) && requiredViews.every((view) => contract.views.includes(view));
    if (!isObject(contract) || contract.fullBody !== true || contract.bindPose !== 'strict-t-pose' || !viewsComplete || contract.commanderIconSource !== true) {
      errors.push(issue('error', 'CHARACTER_CONCEPT_CONTRACT_INVALID', `${at}.characterContract`, 'Character concept requires full-body strict T-pose front/left-side/back/three-quarter views and an explicit commander-icon declaration.'));
    }
    if (contract?.faceAnimationEnabled === false && !['sealed-helmet', 'opaque-mask'].includes(contract?.presentation)) {
      errors.push(issue('error', 'CHARACTER_CONCEPT_FACE_POLICY_INVALID', `${at}.characterContract`, 'A concept with facial animation disabled must use a sealed helmet or opaque mask.'));
    }
  }
  if (typeof record.brief !== 'string' || record.brief.trim().length === 0) errors.push(issue('error', 'CONCEPT_BRIEF_MISSING', `${at}.brief`, 'A concrete art brief is required.'));
  validateControlledArray(record.camera, CAMERAS, `${at}.camera`, 'CONCEPT_CAMERA_INVALID', errors);
  if (!isObject(record.scale) || !SCALES.has(record.scale.class) || typeof record.scale.reference !== 'string' || record.scale.reference.trim().length === 0) {
    errors.push(issue('error', 'CONCEPT_SCALE_INVALID', `${at}.scale`, 'Concept scale class and reference are required.'));
  }
  if (!isObject(record.lod) || !LOD_PROFILES.has(record.lod.profile) || !Array.isArray(record.lod.requiredLevels) || record.lod.requiredLevels.length === 0 || typeof record.lod.budgetStatus !== 'string') {
    errors.push(issue('error', 'CONCEPT_LOD_INVALID', `${at}.lod`, 'Concept LOD profile, required levels, and budget status are required.'));
  }
  validateControlledArray(record.runtimeConsumers, RUNTIME_CONSUMERS, `${at}.runtimeConsumers`, 'CONCEPT_CONSUMER_INVALID', errors);
  if (!Array.isArray(record.modelTargets) || record.modelTargets.length === 0 || record.modelTargets.some((id) => typeof id !== 'string' || !ID_RE.test(id))) {
    errors.push(issue('error', 'CONCEPT_MODEL_TARGET_INVALID', `${at}.modelTargets`, 'At least one lower_snake_case model target is required.'));
  }
  const localReferences = [];
  findAbsoluteLocalReferences(record, at, localReferences);
  for (const ref of localReferences) errors.push(issue('error', 'ABSOLUTE_CONCEPT_CATALOG_PATH', ref.location, `Machine-local catalog path is forbidden: ${ref.value}`));

  if (planned) {
    if (record.status !== 'PLANNED') errors.push(issue('error', 'PLANNED_STATUS_INVALID', `${at}.status`, 'Planned brief status must be PLANNED.'));
    if ('evidence' in record || 'sourcePath' in record || 'integrity' in record || 'approvalStatus' in record) {
      errors.push(issue('error', 'PLANNED_BRIEF_FAKE_EVIDENCE', at, 'Planned briefs cannot claim source files, hashes, or approval evidence.'));
    }
    return;
  }

  if (!['CREATED_EXTERNAL_AWAITING_INGEST', 'INGESTED', 'APPROVED', 'REJECTED'].includes(record.status)) {
    errors.push(issue('error', 'CONCEPT_STATUS_INVALID', `${at}.status`, 'Unsupported concept status.'));
  }
  const evidence = record.evidence;
  if (!isObject(evidence)) {
    errors.push(issue('error', 'CONCEPT_EVIDENCE_MISSING', `${at}.evidence`, 'Created concepts require evidence.'));
    return;
  }
  if (evidence.sourceOnly !== true || evidence.pixelUsage !== 'concept-reference-only' || evidence.pixelsUsedAsTexture !== false) {
    errors.push(issue('error', 'CONCEPT_PIXEL_POLICY_INVALID', `${at}.evidence`, 'Concept pixels are source-only reference and cannot be runtime textures.'));
  }
  if (!isRelativeRepoPath(evidence.plannedPath)) errors.push(issue('error', 'CONCEPT_PLANNED_PATH_INVALID', `${at}.evidence.plannedPath`, 'Planned ingest path must be repository-relative.'));
  if (evidence.sourcePath !== null && !isRelativeRepoPath(evidence.sourcePath)) errors.push(issue('error', 'CONCEPT_SOURCE_PATH_INVALID', `${at}.evidence.sourcePath`, 'Source path must be null or repository-relative.'));
  if (evidence.integrity?.algorithm !== 'sha256' || evidence.integrity?.status !== 'verified' || !SHA256_RE.test(evidence.integrity?.digest ?? '')) {
    errors.push(issue('error', 'CONCEPT_INTEGRITY_INVALID', `${at}.evidence.integrity`, 'Created concepts require their measured SHA-256 digest.'));
  }
  const generation = evidence.generationEvidence;
  const hasExecution = typeof generation?.executionId === 'string' && generation.executionId.trim().length > 0;
  const hasManifest = isRelativeRepoPath(generation?.manifestPath) && typeof generation?.manifestConceptId === 'string' && ID_RE.test(generation.manifestConceptId);
  if (!isObject(generation) || !['imagegen', 'manual'].includes(generation.system) || (!hasExecution && !hasManifest)) {
    errors.push(issue('error', 'CONCEPT_GENERATION_EVIDENCE_INVALID', `${at}.evidence.generationEvidence`, 'Generation evidence requires an execution id or an ingested manifest path and manifest concept id.'));
  }
  if (options.checkFiles && hasManifest && !existsSync(resolve(options.repoRoot, generation.manifestPath))) {
    errors.push(issue('error', 'CONCEPT_GENERATION_MANIFEST_MISSING', `${at}.evidence.generationEvidence.manifestPath`, `Generation manifest is not present: ${generation.manifestPath}`));
  }
  if (record.status === 'CREATED_EXTERNAL_AWAITING_INGEST') {
    if (evidence.sourcePath !== null) errors.push(issue('error', 'EXTERNAL_CONCEPT_SOURCE_PATH_INVALID', `${at}.evidence.sourcePath`, 'External concepts must remain pathless until repository ingest.'));
    if (evidence.approvalStatus === 'APPROVED') errors.push(issue('error', 'EXTERNAL_CONCEPT_APPROVAL_INVALID', `${at}.evidence.approvalStatus`, 'External concepts cannot be approved before ingest.'));
  }
  if (record.status === 'INGESTED' || record.status === 'APPROVED') {
    if (!isRelativeRepoPath(evidence.sourcePath)) errors.push(issue('error', 'INGESTED_CONCEPT_PATH_REQUIRED', `${at}.evidence.sourcePath`, 'Ingested concepts require a repository-relative source path.'));
  }
  if (record.status === 'APPROVED' && evidence.approvalStatus !== 'APPROVED') {
    errors.push(issue('error', 'CONCEPT_APPROVAL_INVALID', `${at}.evidence.approvalStatus`, 'Approved catalog status requires approved evidence.'));
  }
  if (options.checkFiles && typeof evidence.sourcePath === 'string' && isRelativeRepoPath(evidence.sourcePath)) {
    const absoluteConcept = resolve(options.repoRoot, evidence.sourcePath);
    if (!existsSync(absoluteConcept)) {
      errors.push(issue('error', 'CONCEPT_FILE_MISSING', `${at}.evidence.sourcePath`, `Concept file is not present: ${evidence.sourcePath}`));
    } else {
      validateEvidenceFile(absoluteConcept, evidence, `${at}.evidence`, errors);
    }
  }
}

function validateVocabularyList(actual, expected, at, errors) {
  if (!Array.isArray(actual)) {
    errors.push(issue('error', 'VOCABULARY_MISSING', at, 'Controlled vocabulary list is required.'));
    return;
  }
  const actualSet = new Set(actual);
  const missing = [...expected].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expected.has(value));
  if (missing.length || extra.length || actual.length !== actualSet.size) {
    errors.push(issue('error', 'VOCABULARY_MISMATCH', at, `Vocabulary mismatch; missing=[${missing.join(',')}], extra=[${extra.join(',')}].`));
  }
}

function recordCovers(record, biome, faction, modelIntention) {
  const axes = record?.productionAxes;
  return record?.coverageScope === 'production-matrix' && isObject(axes) &&
    axes.biomeOrBiodome?.includes(biome) && axes.faction?.includes(faction) && axes.modelIntention?.includes(modelIntention);
}

function coverageForCell(catalog, cell) {
  const concepts = (Array.isArray(catalog?.concepts) ? catalog.concepts : []).filter((record) => record?.status === 'APPROVED');
  const briefs = Array.isArray(catalog?.plannedBriefs) ? catalog.plannedBriefs : [];
  const required = Array.isArray(cell?.requiredModelIntentions) ? cell.requiredModelIntentions : [];
  const coveredIntentions = required.filter((intention) => concepts.some((record) => recordCovers(record, cell.biomeOrBiodome, cell.faction, intention)));
  const plannedIntentions = required.filter((intention) => !coveredIntentions.includes(intention) && briefs.some((record) => recordCovers(record, cell.biomeOrBiodome, cell.faction, intention)));
  const unbriefedIntentions = required.filter((intention) => !coveredIntentions.includes(intention) && !plannedIntentions.includes(intention));
  const conceptIds = concepts.filter((record) => required.some((intention) => recordCovers(record, cell.biomeOrBiodome, cell.faction, intention))).map((record) => record.id);
  const briefIds = briefs.filter((record) => plannedIntentions.some((intention) => recordCovers(record, cell.biomeOrBiodome, cell.faction, intention))).map((record) => record.id);
  return { coveredIntentions, plannedIntentions, unbriefedIntentions, conceptIds, briefIds };
}

function validateProductionCoverage(catalog, options, errors) {
  const coverage = catalog?.productionCoverage;
  if (!isObject(coverage)) {
    errors.push(issue('error', 'PRODUCTION_COVERAGE_REQUIRED', 'productionCoverage', 'An explicit production coverage matrix is required.'));
    return;
  }
  if (coverage.matrixId !== 'massfront-production-concept-coverage-v1') errors.push(issue('error', 'PRODUCTION_MATRIX_ID_INVALID', 'productionCoverage.matrixId', 'Unexpected production coverage matrix id.'));
  if (!isRelativeRepoPath(coverage.reportPath)) errors.push(issue('error', 'PRODUCTION_REPORT_PATH_INVALID', 'productionCoverage.reportPath', 'Coverage report path must be repository-relative.'));
  if (typeof coverage.coverageMeaning !== 'string' || coverage.coverageMeaning.trim().length === 0) errors.push(issue('error', 'PRODUCTION_COVERAGE_MEANING_REQUIRED', 'productionCoverage.coverageMeaning', 'Coverage meaning must be explicit.'));
  const cells = coverage.cells;
  if (!Array.isArray(cells)) {
    errors.push(issue('error', 'PRODUCTION_MATRIX_CELLS_REQUIRED', 'productionCoverage.cells', 'Coverage cells must be an array.'));
    return;
  }
  const expectedCells = [];
  for (const biome of PRODUCTION_BIOMES) for (const faction of PRODUCTION_FACTIONS) expectedCells.push(`${biome}::${faction}`);
  const actualCells = [];
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const at = `productionCoverage.cells[${index}]`;
    if (!isObject(cell)) {
      errors.push(issue('error', 'PRODUCTION_MATRIX_CELL_INVALID', at, 'Coverage cell must be an object.'));
      continue;
    }
    if (!PRODUCTION_BIOMES.has(cell.biomeOrBiodome)) errors.push(issue('error', 'PRODUCTION_MATRIX_BIOME_INVALID', `${at}.biomeOrBiodome`, 'Unsupported production biome/biodome.'));
    if (!PRODUCTION_FACTIONS.has(cell.faction)) errors.push(issue('error', 'PRODUCTION_MATRIX_FACTION_INVALID', `${at}.faction`, 'Unsupported production faction.'));
    const key = `${cell.biomeOrBiodome}::${cell.faction}`;
    if (actualCells.includes(key)) errors.push(issue('error', 'PRODUCTION_MATRIX_CELL_DUPLICATE', at, `Duplicate production matrix cell ${key}.`));
    actualCells.push(key);
    if (!['REQUIRED', 'NOT_APPLICABLE'].includes(cell.applicability)) errors.push(issue('error', 'PRODUCTION_MATRIX_APPLICABILITY_INVALID', `${at}.applicability`, 'Applicability must be REQUIRED or NOT_APPLICABLE.'));
    validateControlledArray(cell.requiredModelIntentions, MODEL_INTENTIONS, `${at}.requiredModelIntentions`, 'PRODUCTION_MATRIX_INTENTIONS_INVALID', errors, { allowEmpty: cell.applicability === 'NOT_APPLICABLE' });
    if (cell.applicability === 'REQUIRED' && (!Array.isArray(cell.requiredModelIntentions) || cell.requiredModelIntentions.length === 0)) errors.push(issue('error', 'PRODUCTION_MATRIX_REQUIREMENTS_EMPTY', `${at}.requiredModelIntentions`, 'Required cells need at least one model intention.'));
    if (cell.applicability === 'NOT_APPLICABLE' && Array.isArray(cell.requiredModelIntentions) && cell.requiredModelIntentions.length > 0) errors.push(issue('error', 'PRODUCTION_MATRIX_NA_REQUIREMENTS', `${at}.requiredModelIntentions`, 'Not-applicable cells cannot declare requirements.'));
    if (typeof cell.rationale !== 'string' || cell.rationale.trim().length === 0) errors.push(issue('error', 'PRODUCTION_MATRIX_RATIONALE_REQUIRED', `${at}.rationale`, 'Every cell needs an applicability rationale.'));
    if (cell.applicability === 'REQUIRED') {
      const derived = coverageForCell(catalog, cell);
      if (derived.unbriefedIntentions.length > 0) errors.push(issue('error', 'PRODUCTION_COVERAGE_GAP_UNBRIEFED', at, `Missing concrete briefs for ${derived.unbriefedIntentions.join(', ')}.`));
    }
  }
  if (cells.length !== expectedCells.length || expectedCells.some((key, index) => actualCells[index] !== key)) {
    errors.push(issue('error', 'PRODUCTION_MATRIX_INCOMPLETE', 'productionCoverage.cells', 'Matrix must contain the complete ordered 7 biome/biodome x 6 faction cross-product.'));
  }
  const applicableKeys = new Set(cells.filter((cell) => cell?.applicability === 'REQUIRED').map((cell) => `${cell.biomeOrBiodome}::${cell.faction}`));
  for (const [collection, records] of [['concepts', catalog.concepts], ['plannedBriefs', catalog.plannedBriefs]]) {
    for (let index = 0; index < (Array.isArray(records) ? records.length : 0); index += 1) {
      const record = records[index];
      if (record?.coverageScope !== 'production-matrix' || !isObject(record.productionAxes)) continue;
      for (const biome of record.productionAxes.biomeOrBiodome ?? []) for (const faction of record.productionAxes.faction ?? []) {
        if (!applicableKeys.has(`${biome}::${faction}`)) errors.push(issue('error', 'PRODUCTION_RECORD_TARGETS_NA_CELL', `${collection}[${index}].productionAxes`, `Record targets not-applicable cell ${biome}::${faction}.`));
      }
    }
  }
  if (options.checkFiles && isRelativeRepoPath(coverage.reportPath)) {
    const absoluteReport = resolve(options.repoRoot, coverage.reportPath);
    if (!existsSync(absoluteReport)) errors.push(issue('error', 'PRODUCTION_REPORT_MISSING', 'productionCoverage.reportPath', `Coverage report is not present: ${coverage.reportPath}`));
    else {
      const actual = readFileSync(absoluteReport, 'utf8').replace(/\r\n/g, '\n');
      const expected = renderProductionCoverageReport(catalog);
      if (actual !== expected) errors.push(issue('error', 'PRODUCTION_REPORT_STALE', 'productionCoverage.reportPath', 'Human-readable coverage report does not match the catalog matrix.'));
    }
  }
}

function markdownCell(values) {
  return values.length > 0 ? values.join(', ') : '—';
}

export function renderProductionCoverageReport(catalog) {
  const cells = Array.isArray(catalog?.productionCoverage?.cells) ? catalog.productionCoverage.cells : [];
  const rows = cells.map((cell) => ({ cell, derived: coverageForCell(catalog, cell) }));
  const requiredRows = rows.filter(({ cell }) => cell.applicability === 'REQUIRED');
  const requirementCount = requiredRows.reduce((sum, { cell }) => sum + cell.requiredModelIntentions.length, 0);
  const coveredCount = requiredRows.reduce((sum, { derived }) => sum + derived.coveredIntentions.length, 0);
  const plannedCount = requiredRows.reduce((sum, { derived }) => sum + derived.plannedIntentions.length, 0);
  const unbriefedCount = requiredRows.reduce((sum, { derived }) => sum + derived.unbriefedIntentions.length, 0);
  const output = [
    '# MASSFRONT Production Concept Coverage',
    '',
    '> Generated deterministically from `concept-catalog.v1.json`. Do not edit this report by hand.',
    '',
    catalog?.productionCoverage?.coverageMeaning ?? '',
    '',
    '## Summary',
    '',
    `- Required cells: ${requiredRows.length} of ${cells.length}.`,
    `- Required model-intention references: ${requirementCount}.`,
    `- Covered by approved source concepts: ${coveredCount}.`,
    `- Missing but assigned to concrete planned briefs: ${plannedCount}.`,
    `- Missing and unbriefed: ${unbriefedCount}.`,
    '',
    '## Coverage matrix',
    '',
    '| Biome / biodome | Faction | Status | Covered intentions | Planned gaps | Concrete brief IDs |',
    '|---|---|---|---|---|---|'
  ];
  for (const { cell, derived } of rows) {
    const status = cell.applicability === 'NOT_APPLICABLE' ? 'N/A' : derived.unbriefedIntentions.length > 0 ? 'UNBRIEFED' : derived.plannedIntentions.length > 0 ? 'PLANNED' : 'COVERED';
    output.push(`| ${cell.biomeOrBiodome} | ${cell.faction} | ${status} | ${markdownCell(derived.coveredIntentions)} | ${markdownCell([...derived.plannedIntentions, ...derived.unbriefedIntentions])} | ${markdownCell(derived.briefIds)} |`);
  }
  output.push('', '## Concrete missing briefs', '', '| Brief ID | Production cells | Model intentions | Deliverable |', '|---|---|---|---|');
  const contributing = new Map();
  for (const { cell, derived } of requiredRows) for (const briefId of derived.briefIds) {
    const entry = contributing.get(briefId) ?? { cells: new Set(), intentions: new Set() };
    entry.cells.add(`${cell.biomeOrBiodome} / ${cell.faction}`);
    for (const intention of derived.plannedIntentions) {
      const brief = catalog.plannedBriefs.find((record) => record.id === briefId);
      if (brief && recordCovers(brief, cell.biomeOrBiodome, cell.faction, intention)) entry.intentions.add(intention);
    }
    contributing.set(briefId, entry);
  }
  for (const brief of catalog.plannedBriefs ?? []) {
    const entry = contributing.get(brief.id);
    if (!entry) continue;
    output.push(`| ${brief.id} | ${markdownCell([...entry.cells])} | ${markdownCell([...entry.intentions])} | ${brief.brief.replace(/\|/g, '\\|')} |`);
  }
  output.push('', '## Approved modeling references', '', '| Concept ID | Force / relationship role | Matrix scope | Biome / biodome axes | Faction axes | Model-intention axes | Camera / scale / consumers / LOD |', '|---|---|---|---|---|---|---|');
  for (const concept of (catalog.concepts ?? []).filter((record) => record.status === 'APPROVED')) {
    const axes = concept.productionAxes ?? { biomeOrBiodome: [], faction: [], modelIntention: [] };
    output.push(`| ${concept.id} | ${markdownCell(concept.forceRelationshipRole ?? [])} | ${concept.coverageScope} | ${markdownCell(axes.biomeOrBiodome)} | ${markdownCell(axes.faction)} | ${markdownCell(axes.modelIntention)} | ${markdownCell(concept.camera ?? [])}; ${concept.scale?.class ?? '—'}; ${markdownCell(concept.runtimeConsumers ?? [])}; ${concept.lod?.profile ?? '—'} (${markdownCell(concept.lod?.requiredLevels ?? [])}) |`);
  }
  const outsideConcepts = (catalog.concepts ?? []).filter((concept) => concept.status === 'APPROVED' && concept.coverageScope === 'outside-production-matrix');
  const rejectedConcepts = (catalog.concepts ?? []).filter((concept) => concept.status === 'REJECTED');
  const outside = (catalog.plannedBriefs ?? []).filter((brief) => brief.coverageScope === 'outside-production-matrix');
  output.push('', '## Deliberately outside this model matrix', '');
  for (const concept of outsideConcepts) output.push(`- **${concept.id} (approved source concept):** ${concept.brief}`);
  for (const brief of outside) output.push(`- **${brief.id}:** ${brief.brief}`);
  output.push('', '## Rejected or superseded source concepts', '');
  if (rejectedConcepts.length === 0) output.push('- None.');
  for (const concept of rejectedConcepts) output.push(`- **${concept.id}:** ${concept.canonicalDisposition?.reason ?? concept.brief} Replacement: ${concept.canonicalDisposition?.replacementConceptId ?? concept.canonicalDisposition?.replacementBriefId ?? 'none declared'}.`);
  output.push('', 'Coverage means an approved source-only modeling reference exists for the category. It does not mean runtime geometry, textures, rigs, animation, LODs, or device QA are complete.', '');
  return `${output.join('\n')}\n`;
}

function sameOrderedValues(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameStringMapping(actual, expected) {
  if (!isObject(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => actual[key] === expected[key]);
}

function validateExactObjectKeys(value, expectedKeys, at, errors) {
  if (!isObject(value)) return;
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(issue('error', 'TEXTURE_SCHEMA_SHAPE_INVALID', `${at}.${key}`, `Required property ${key} is missing.`));
  for (const key of Object.keys(value)) if (!expected.has(key)) errors.push(issue('error', 'TEXTURE_SCHEMA_SHAPE_INVALID', `${at}.${key}`, `Unexpected property ${key}.`));
}

function validateUniqueArray(value, at, errors) {
  if (!Array.isArray(value)) return;
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const key = JSON.stringify(value[index]);
    if (seen.has(key)) errors.push(issue('error', 'TEXTURE_ARRAY_DUPLICATE', `${at}[${index}]`, 'Array values must be unique.'));
    seen.add(key);
  }
}

function textureTargetDomain(targetId) {
  if (targetId.startsWith('map_')) return 'MAP';
  if (targetId.startsWith('city_')) return 'CITY';
  if (targetId.startsWith('ship_')) return 'SHIP_SECTION';
  return null;
}

function expectedTextureTargetAxes(targetId) {
  if (targetId.startsWith('map_theme_')) {
    const theme = targetId.slice('map_theme_'.length);
    return { themeIds: [theme], locationIds: [], factionIds: [], sectionIds: [], districtIds: [], requiredMaterialRoles: ['terrain-ground', 'terrain-soil-rock', 'terrain-paving'] };
  }
  if (targetId.startsWith('map_location_')) {
    const region = targetId.slice('map_location_'.length);
    const axes = TEXTURE_REGION_AXES[region];
    if (!axes) return null;
    return { themeIds: axes.themes, locationIds: ['small', 'medium', 'large'].map((size) => `${region}_${size}`), factionIds: axes.faction, sectionIds: [], districtIds: [], requiredMaterialRoles: ['location-accent'] };
  }
  if (TEXTURE_CITY_AXES[targetId]) {
    const axes = TEXTURE_CITY_AXES[targetId];
    return { themeIds: ['verdant', 'arctic', 'ashland', 'vespera'], locationIds: axes.locations, factionIds: axes.factions, sectionIds: [], districtIds: [], requiredMaterialRoles: ['architecture-facade', 'architecture-roof', 'architecture-contact'] };
  }
  if (TEXTURE_SHIP_AXES[targetId]) {
    const axes = TEXTURE_SHIP_AXES[targetId];
    return { themeIds: [], locationIds: [], factionIds: axes.factions, sectionIds: axes.section, districtIds: axes.districts, requiredMaterialRoles: ['interior-floor', 'interior-wall', 'interior-machinery'] };
  }
  return null;
}

function textureBudgetContract(pack) {
  const targetIds = Array.isArray(pack?.coverageTargetIds) ? pack.coverageTargetIds : [];
  if (pack?.domain === 'MAP' && targetIds.length > 0 && targetIds.every((id) => typeof id === 'string' && id.startsWith('map_theme_'))) return TEXTURE_DOMAIN_BUDGET.MAP_BASE;
  if (pack?.domain === 'MAP') return TEXTURE_DOMAIN_BUDGET.MAP_LOCATION;
  if (pack?.domain === 'CITY') return TEXTURE_DOMAIN_BUDGET.CITY;
  if (pack?.domain === 'SHIP_SECTION') return TEXTURE_DOMAIN_BUDGET.SHIP_SECTION;
  return null;
}

function validateTextureIntegrity(integrity, at, errors) {
  if (!isObject(integrity) || integrity.algorithm !== 'sha256' || integrity.status !== 'verified' || !SHA256_RE.test(integrity.digest ?? '')) {
    errors.push(issue('error', 'TEXTURE_INTEGRITY_INVALID', at, 'Approved texture evidence requires a verified SHA-256 digest.'));
  }
}

function encodedTextureDimensions(data) {
  if (data.length >= 24 && data.subarray(1, 4).toString('ascii') === 'PNG') return { container: 'PNG', dimensions: [data.readUInt32BE(16), data.readUInt32BE(20)] };
  const ktx2Magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length >= 28 && ktx2Magic.every((value, index) => data[index] === value)) return { container: 'KTX2', dimensions: [data.readUInt32LE(20), data.readUInt32LE(24)] };
  return null;
}

function validateTextureEvidenceFile(evidence, at, options, conceptSourcePaths, conceptSourceDigests, errors) {
  if (!isObject(evidence)) {
    errors.push(issue('error', 'TEXTURE_EVIDENCE_INVALID', at, 'Approved texture evidence must be an object.'));
    return;
  }
  validateExactObjectKeys(evidence, ['path', 'integrity'], at, errors);
  validateExactObjectKeys(evidence.integrity, ['algorithm', 'status', 'digest'], `${at}.integrity`, errors);
  if (!isRelativeRepoPath(evidence.path)) errors.push(issue('error', 'TEXTURE_EVIDENCE_PATH_INVALID', `${at}.path`, 'Approved texture path must be repository-relative.'));
  if (conceptSourcePaths.has(String(evidence.path).toLowerCase())) errors.push(issue('error', 'TEXTURE_REFERENCE_PIXELS_AS_ASSET', `${at}.path`, 'A concept-art source path cannot be promoted as a runtime texture.'));
  if (conceptSourceDigests.has(evidence?.integrity?.digest)) errors.push(issue('error', 'TEXTURE_REFERENCE_PIXELS_AS_ASSET', `${at}.integrity.digest`, 'A concept-art file digest cannot be promoted as a runtime texture under another name.'));
  validateTextureIntegrity(evidence.integrity, `${at}.integrity`, errors);
  if (!options.checkFiles || !isRelativeRepoPath(evidence.path)) return;
  const absolute = resolve(options.repoRoot, evidence.path);
  if (!existsSync(absolute)) {
    errors.push(issue('error', 'TEXTURE_EVIDENCE_FILE_MISSING', `${at}.path`, `Approved texture is not present: ${evidence.path}`));
    return;
  }
  const data = readFileSync(absolute);
  const encoded = encodedTextureDimensions(data);
  if (!encoded || encoded.container !== 'KTX2') errors.push(issue('error', 'TEXTURE_EVIDENCE_FORMAT_INVALID', `${at}.path`, 'Approved runtime texture evidence must have a valid KTX2 header.'));
  else if (!sameOrderedValues(encoded.dimensions, [2048, 2048])) errors.push(issue('error', 'TEXTURE_EVIDENCE_RESOLUTION_NOT_2K', `${at}.path`, `Approved texture is ${encoded.dimensions.join('x')}; expected 2048x2048.`));
  if (SHA256_RE.test(evidence?.integrity?.digest ?? '')) {
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== evidence.integrity.digest) errors.push(issue('error', 'TEXTURE_HASH_MISMATCH', `${at}.integrity.digest`, `Expected ${evidence.integrity.digest}; found ${actual}.`));
  }
}

export function renderTextureThemeCoverageReport(catalog) {
  const targets = Array.isArray(catalog?.targets) ? catalog.targets : [];
  const packs = Array.isArray(catalog?.packs) ? catalog.packs : [];
  const packById = new Map(packs.map((pack) => [pack?.id, pack]));
  const approved = packs.filter((pack) => pack?.status === 'APPROVED').length;
  const planned = packs.filter((pack) => pack?.status === 'PLANNED').length;
  const missing = targets.filter((target) => (target?.requiredPackIds ?? []).some((id) => !packById.has(id))).length;
  const countDomain = (domain) => targets.filter((target) => target?.domain === domain).length;
  const output = [
    '# MASSFRONT Texture Theme Production Coverage',
    '',
    '> Generated deterministically from `texture-theme-catalog.v1.json`. Do not edit this report by hand.',
    '',
    catalog?.coverageMeaning ?? '',
    '',
    '## Summary',
    '',
    `- Targets: ${targets.length} (${countDomain('MAP')} MAP, ${countDomain('CITY')} CITY, ${countDomain('SHIP_SECTION')} SHIP SECTION).`,
    `- Planned 2K packs: ${planned}.`,
    `- Approved runtime packs: ${approved}.`,
    `- Targets missing an assigned pack: ${missing}.`,
    '',
    'Planned coverage is a bounded production brief, not finished art. A pack becomes approved only after exact 2048×2048 paired files, hashes, objective seam proof, and matched real-phone captures exist.',
    '',
    '## Mandatory production contract',
    '',
    '- Every material role is an original, lighting-neutral, seamless 2048×2048 albedo plus matching tangent-space normal map with roughness in alpha.',
    '- Albedo is sampled as sRGB; normal/roughness is sampled as linear data. Both maps use KTX2/BasisU-UASTC-or-equivalent with mipmaps.',
    '- Concept images guide material language only. Their pixels may never be cropped, projected, or repackaged as texture data.',
    '- Seam approval requires a four-way offset inspection and 3×3 repeated-tile proof. Mobile approval requires matched phone portrait/landscape captures with no seams, shimmer, or unreadable texel scale.',
    '- Anisotropy is requested from the shared budget and capped at 8×. Residency is scoped to the current map, location overlay, city family, or ship section.',
    '',
    '## Audited source consumers',
    '',
    '| Consumer ID | Domain | Source | Symbols | Finding |',
    '|---|---|---|---|---|'
  ];
  for (const consumer of catalog?.consumerAudit ?? []) {
    output.push(`| ${consumer.id} | ${markdownCell(consumer.domains ?? [])} | ${consumer.sourcePath} | ${markdownCell(consumer.symbols ?? [])} | ${(consumer.finding ?? '').replace(/\|/g, '\\|')} |`);
  }
  output.push('', '## Coverage targets', '', '| Target | Domain | Themes | Locations | Factions | Ship districts | Material roles | Pack / status |', '|---|---|---|---|---|---|---|---|');
  for (const target of targets) {
    const required = (target.requiredPackIds ?? []).map((id) => `${id} (${packById.get(id)?.status ?? 'MISSING'})`);
    output.push(`| ${target.id} | ${target.domain} | ${markdownCell(target.themeIds ?? [])} | ${markdownCell(target.locationIds ?? [])} | ${markdownCell(target.factionIds ?? [])} | ${markdownCell(target.districtIds ?? [])} | ${markdownCell(target.requiredMaterialRoles ?? [])} | ${markdownCell(required)} |`);
  }
  output.push('', '## Pack specifications', '', '| Pack | Domain / status | Roles and texel scale | Concepts | Consumers | Residency / GPU target | Seam / mobile evidence |', '|---|---|---|---|---|---|---|');
  for (const pack of packs) {
    const roles = (pack.materialRoles ?? []).map((role) => `${role.role}: ${role.metersPerTile}m @ ${role.pixelsPerMeter}px/m`);
    const evidence = `${pack.seamProof?.status ?? 'UNKNOWN'} / ${pack.mobileCapture?.status ?? 'UNKNOWN'}`;
    output.push(`| ${pack.id} | ${pack.domain} / ${pack.status} | ${markdownCell(roles)} | ${markdownCell(pack.conceptReference?.conceptIds ?? [])} | ${markdownCell(pack.consumerIds ?? [])} | ${pack.residencyBudget?.strategy ?? '—'}; ${pack.residencyBudget?.maxResidentMaterialPairs ?? '—'} pairs; ${pack.residencyBudget?.targetCompressedGpuMiB ?? '—'} MiB | ${evidence} |`);
  }
  output.push('', '## NEXUS-VII integration warning', '', 'The five production groupings are authoring briefs, not one-to-one runtime material families. The current interior embeds six district PBR families in `uga-command-cutaway.glb`: `uga-command-navigation`, `uga-operations`, `uga-science`, `uga-industrial`, `uga-civic-medical`, and `uga-diplomatic`. Loose source PNG changes do not reach the player build until the GLB and optional runtime content pack are rebuilt.', '', 'The current Blender bridge consumes separate base-color, normal, roughness, metallic, AO, height, and emissive inputs, and currently uses normal alpha for height. The new packed normal/roughness contract therefore needs an explicit build conversion and supported glTF/KTX2 delivery path; it must not be dropped into the existing normal-alpha slot unchanged.', '', 'This matrix records texture work that is planned or proven. It does not claim any planned pack is authored, seamless, integrated, or device-approved.', '');
  return `${output.join('\n')}\n`;
}

export function validateTextureThemeCatalog(catalog, conceptCatalog, options = {}) {
  const errors = [];
  const warnings = [];
  const normalizedOptions = { checkFiles: false, repoRoot: REPO_ROOT, ...options };
  if (!isObject(catalog)) return { ok: false, errors: [issue('error', 'TEXTURE_CATALOG_INVALID', '$', 'Texture theme catalog root must be an object.')], warnings };
  validateExactObjectKeys(catalog, ['schemaRef', 'schemaVersion', 'catalogId', 'reportPath', 'coverageMeaning', 'consumerAudit', 'targets', 'packs'], '$', errors);
  const absoluteReferences = [];
  findAbsoluteLocalReferences(catalog, '$', absoluteReferences);
  for (const entry of absoluteReferences) errors.push(issue('error', 'TEXTURE_ABSOLUTE_LOCAL_REFERENCE', entry.location, `Absolute local reference is forbidden: ${entry.value}`));
  if (catalog.schemaRef !== './assets.v1.schema.json#/$defs/textureThemeCatalog') errors.push(issue('error', 'TEXTURE_SCHEMA_REFERENCE_INVALID', 'schemaRef', 'Unexpected texture theme schema reference.'));
  if (catalog.schemaVersion !== 1) errors.push(issue('error', 'TEXTURE_SCHEMA_VERSION_INVALID', 'schemaVersion', 'Expected schemaVersion 1.'));
  if (catalog.catalogId !== 'massfront-texture-theme-production-v1') errors.push(issue('error', 'TEXTURE_CATALOG_ID_INVALID', 'catalogId', 'Unexpected texture theme catalog id.'));
  if (!isRelativeRepoPath(catalog.reportPath)) errors.push(issue('error', 'TEXTURE_REPORT_PATH_INVALID', 'reportPath', 'Texture coverage report path must be repository-relative.'));
  if (typeof catalog.coverageMeaning !== 'string' || catalog.coverageMeaning.trim().length === 0) errors.push(issue('error', 'TEXTURE_COVERAGE_MEANING_REQUIRED', 'coverageMeaning', 'Texture coverage meaning must be explicit.'));

  const conceptById = new Map((Array.isArray(conceptCatalog?.concepts) ? conceptCatalog.concepts : []).map((concept) => [concept?.id, concept]));
  const approvedConceptIds = new Set([...conceptById].filter(([, concept]) => concept?.status === 'APPROVED' && concept?.evidence?.approvalStatus === 'APPROVED').map(([id]) => id));
  const conceptSourcePaths = new Set([...conceptById.values()].map((concept) => concept?.evidence?.sourcePath).filter((path) => typeof path === 'string').map((path) => path.toLowerCase()));
  const conceptSourceDigests = new Set([...conceptById.values()].map((concept) => concept?.evidence?.integrity?.digest).filter((digest) => SHA256_RE.test(digest ?? '')));

  const consumerIds = new Set();
  const consumerById = new Map();
  if (!Array.isArray(catalog.consumerAudit) || catalog.consumerAudit.length === 0) errors.push(issue('error', 'TEXTURE_CONSUMER_AUDIT_REQUIRED', 'consumerAudit', 'At least one source consumer audit entry is required.'));
  else for (let index = 0; index < catalog.consumerAudit.length; index += 1) {
    const consumer = catalog.consumerAudit[index];
    const at = `consumerAudit[${index}]`;
    validateExactObjectKeys(consumer, ['id', 'domains', 'sourcePath', 'symbols', 'finding'], at, errors);
    if (!isObject(consumer) || typeof consumer.id !== 'string' || !ID_RE.test(consumer.id)) errors.push(issue('error', 'TEXTURE_CONSUMER_INVALID', `${at}.id`, 'Consumer id must be lowercase snake_case.'));
    else if (consumerIds.has(consumer.id)) errors.push(issue('error', 'TEXTURE_CONSUMER_DUPLICATE', `${at}.id`, `Duplicate consumer ${consumer.id}.`));
    else {
      consumerIds.add(consumer.id);
      consumerById.set(consumer.id, consumer);
    }
    validateControlledArray(consumer?.domains, TEXTURE_DOMAINS, `${at}.domains`, 'TEXTURE_CONSUMER_DOMAIN_INVALID', errors);
    if (!isRelativeRepoPath(consumer?.sourcePath)) errors.push(issue('error', 'TEXTURE_CONSUMER_SOURCE_INVALID', `${at}.sourcePath`, 'Consumer source must be repository-relative.'));
    else if (normalizedOptions.checkFiles && !existsSync(resolve(normalizedOptions.repoRoot, consumer.sourcePath))) errors.push(issue('error', 'TEXTURE_CONSUMER_SOURCE_MISSING', `${at}.sourcePath`, `Consumer source does not exist: ${consumer.sourcePath}`));
    else if (normalizedOptions.checkFiles) {
      const source = readFileSync(resolve(normalizedOptions.repoRoot, consumer.sourcePath), 'utf8');
      for (let symbolIndex = 0; symbolIndex < (Array.isArray(consumer.symbols) ? consumer.symbols.length : 0); symbolIndex += 1) if (!source.includes(consumer.symbols[symbolIndex])) errors.push(issue('error', 'TEXTURE_CONSUMER_SYMBOL_MISSING', `${at}.symbols[${symbolIndex}]`, `Symbol ${consumer.symbols[symbolIndex]} was not found in ${consumer.sourcePath}.`));
    }
    if (!Array.isArray(consumer?.symbols) || consumer.symbols.length === 0 || consumer.symbols.some((symbol) => typeof symbol !== 'string' || symbol.length === 0)) errors.push(issue('error', 'TEXTURE_CONSUMER_SYMBOLS_REQUIRED', `${at}.symbols`, 'Consumer symbols must be a non-empty string array.'));
    validateUniqueArray(consumer?.symbols, `${at}.symbols`, errors);
    if (typeof consumer?.finding !== 'string' || consumer.finding.trim().length === 0) errors.push(issue('error', 'TEXTURE_CONSUMER_FINDING_REQUIRED', `${at}.finding`, 'Consumer audit finding is required.'));
  }

  const targetById = new Map();
  const actualTargetIds = [];
  if (!Array.isArray(catalog.targets)) errors.push(issue('error', 'TEXTURE_TARGETS_REQUIRED', 'targets', 'Texture targets must be an array.'));
  else for (let index = 0; index < catalog.targets.length; index += 1) {
    const target = catalog.targets[index];
    const at = `targets[${index}]`;
    validateExactObjectKeys(target, ['id', 'domain', 'label', 'themeIds', 'locationIds', 'factionIds', 'sectionIds', 'districtIds', 'requiredMaterialRoles', 'consumerIds', 'requiredPackIds', 'rationale'], at, errors);
    actualTargetIds.push(target?.id);
    if (!isObject(target) || typeof target.id !== 'string' || !ID_RE.test(target.id)) {
      errors.push(issue('error', 'TEXTURE_TARGET_INVALID', `${at}.id`, 'Target id must be lowercase snake_case.'));
      continue;
    }
    if (targetById.has(target.id)) errors.push(issue('error', 'TEXTURE_TARGET_DUPLICATE', `${at}.id`, `Duplicate target ${target.id}.`));
    targetById.set(target.id, target);
    if (target.domain !== textureTargetDomain(target.id)) errors.push(issue('error', 'TEXTURE_TARGET_DOMAIN_MISMATCH', `${at}.domain`, `Target ${target.id} does not match domain ${target.domain}.`));
    for (const field of ['themeIds', 'locationIds', 'factionIds', 'sectionIds', 'districtIds']) {
      if (!Array.isArray(target[field])) errors.push(issue('error', 'TEXTURE_TARGET_AXIS_INVALID', `${at}.${field}`, `${field} must be an array.`));
      validateUniqueArray(target[field], `${at}.${field}`, errors);
    }
    const expectedAxes = expectedTextureTargetAxes(target.id);
    for (const field of ['themeIds', 'locationIds', 'factionIds', 'sectionIds', 'districtIds', 'requiredMaterialRoles']) if (!sameOrderedValues(target[field], expectedAxes?.[field] ?? [])) errors.push(issue('error', 'TEXTURE_TARGET_AXES_MISMATCH', `${at}.${field}`, `Target ${target.id} ${field} does not match the audited source matrix.`));
    validateControlledArray(target.requiredMaterialRoles, TEXTURE_MATERIAL_ROLES, `${at}.requiredMaterialRoles`, 'TEXTURE_TARGET_ROLE_INVALID', errors);
    if (!Array.isArray(target.consumerIds) || target.consumerIds.length === 0) errors.push(issue('error', 'TEXTURE_TARGET_CONSUMERS_REQUIRED', `${at}.consumerIds`, 'Target consumers are required.'));
    else for (let i = 0; i < target.consumerIds.length; i += 1) {
      const consumer = consumerById.get(target.consumerIds[i]);
      if (!consumer) errors.push(issue('error', 'TEXTURE_CONSUMER_REFERENCE_INVALID', `${at}.consumerIds[${i}]`, `Unknown consumer ${target.consumerIds[i]}.`));
      else if (!consumer.domains.includes(target.domain)) errors.push(issue('error', 'TEXTURE_CONSUMER_DOMAIN_MISMATCH', `${at}.consumerIds[${i}]`, `Consumer ${consumer.id} does not support ${target.domain}.`));
    }
    validateUniqueArray(target.consumerIds, `${at}.consumerIds`, errors);
    validateUniqueArray(target.requiredPackIds, `${at}.requiredPackIds`, errors);
    if (!Array.isArray(target.requiredPackIds) || target.requiredPackIds.length === 0) errors.push(issue('error', 'TEXTURE_TARGET_PACK_REQUIRED', `${at}.requiredPackIds`, 'Target requires at least one pack.'));
    if (typeof target.rationale !== 'string' || target.rationale.trim().length === 0) errors.push(issue('error', 'TEXTURE_TARGET_RATIONALE_REQUIRED', `${at}.rationale`, 'Target rationale is required.'));
  }
  if (!sameOrderedValues(actualTargetIds, TEXTURE_TARGET_IDS)) errors.push(issue('error', 'TEXTURE_TARGET_MATRIX_INCOMPLETE', 'targets', 'Texture matrix must contain the exact ordered 4 base themes, 16 named regions, 5 city families, and 5 ship-section groups.'));

  const packById = new Map();
  if (!Array.isArray(catalog.packs)) errors.push(issue('error', 'TEXTURE_PACKS_REQUIRED', 'packs', 'Texture packs must be an array.'));
  else {
    if (catalog.packs.some((pack) => pack?.status === 'APPROVED') && !normalizedOptions.checkFiles) errors.push(issue('error', 'TEXTURE_APPROVAL_REQUIRES_FILE_CHECK', 'packs', 'Catalogs containing APPROVED texture packs must be validated with file checking enabled.'));
  }
  if (Array.isArray(catalog.packs)) for (let index = 0; index < catalog.packs.length; index += 1) {
    const pack = catalog.packs[index];
    const at = `packs[${index}]`;
    validateExactObjectKeys(pack, ['id', 'title', 'status', 'domain', 'coverageTargetIds', 'materialRoles', 'resolution', 'seamless', 'tileable', 'pairedMaps', 'runtimeEncoding', 'anisotropyBudget', 'residencyBudget', 'conceptReference', 'seamProof', 'mobileCapture', 'consumerIds', 'plannedDirectory', 'approvedEvidence'], at, errors);
    if (!isObject(pack) || typeof pack.id !== 'string' || !ID_RE.test(pack.id)) {
      errors.push(issue('error', 'TEXTURE_PACK_INVALID', `${at}.id`, 'Pack id must be lowercase snake_case.'));
      continue;
    }
    if (packById.has(pack.id)) errors.push(issue('error', 'TEXTURE_PACK_DUPLICATE', `${at}.id`, `Duplicate pack ${pack.id}.`));
    packById.set(pack.id, pack);
    const coverageTargetIds = Array.isArray(pack.coverageTargetIds) ? pack.coverageTargetIds : [];
    if (typeof pack.title !== 'string' || pack.title.trim().length === 0) errors.push(issue('error', 'TEXTURE_PACK_TITLE_REQUIRED', `${at}.title`, 'Pack title is required.'));
    if (!['PLANNED', 'APPROVED'].includes(pack.status)) errors.push(issue('error', 'TEXTURE_PACK_STATUS_INVALID', `${at}.status`, 'Pack status must be PLANNED or APPROVED.'));
    if (!TEXTURE_DOMAINS.has(pack.domain)) errors.push(issue('error', 'TEXTURE_PACK_DOMAIN_INVALID', `${at}.domain`, 'Unsupported texture pack domain.'));
    if (!Array.isArray(pack.coverageTargetIds) || pack.coverageTargetIds.length === 0) errors.push(issue('error', 'TEXTURE_PACK_TARGET_REQUIRED', `${at}.coverageTargetIds`, 'Pack must cover at least one target.'));
    else for (let targetIndex = 0; targetIndex < coverageTargetIds.length; targetIndex += 1) {
      const target = targetById.get(coverageTargetIds[targetIndex]);
      if (!target) errors.push(issue('error', 'TEXTURE_PACK_TARGET_INVALID', `${at}.coverageTargetIds[${targetIndex}]`, `Unknown target ${coverageTargetIds[targetIndex]}.`));
      else if (target.domain !== pack.domain) errors.push(issue('error', 'TEXTURE_PACK_TARGET_DOMAIN_MISMATCH', `${at}.coverageTargetIds[${targetIndex}]`, `Target ${target.id} is not in pack domain ${pack.domain}.`));
    }
    validateUniqueArray(pack.coverageTargetIds, `${at}.coverageTargetIds`, errors);

    if (!sameOrderedValues(pack.resolution, [2048, 2048])) errors.push(issue('error', 'TEXTURE_RESOLUTION_NOT_2K', `${at}.resolution`, 'Every authored texture in the pack must be exactly 2048x2048.'));
    if (pack.seamless !== true || pack.tileable !== true) errors.push(issue('error', 'TEXTURE_SEAM_CONTRACT_REQUIRED', at, 'Every material must declare seamless=true and tileable=true.'));
    if (!isObject(pack.pairedMaps) || !isObject(pack.pairedMaps.albedo) || !isObject(pack.pairedMaps.normalRoughness)) {
      errors.push(issue('error', 'TEXTURE_PAIR_REQUIRED', `${at}.pairedMaps`, 'Both albedo and packed normal/roughness maps are required.'));
    } else {
      validateExactObjectKeys(pack.pairedMaps, ['albedo', 'normalRoughness'], `${at}.pairedMaps`, errors);
      const albedo = pack.pairedMaps.albedo;
      const normalRoughness = pack.pairedMaps.normalRoughness;
      validateExactObjectKeys(albedo, ['colorSpace', 'channels'], `${at}.pairedMaps.albedo`, errors);
      validateExactObjectKeys(albedo.channels, ['r', 'g', 'b', 'a'], `${at}.pairedMaps.albedo.channels`, errors);
      validateExactObjectKeys(normalRoughness, ['colorSpace', 'tangentSpace', 'channels'], `${at}.pairedMaps.normalRoughness`, errors);
      validateExactObjectKeys(normalRoughness.channels, ['r', 'g', 'b', 'a'], `${at}.pairedMaps.normalRoughness.channels`, errors);
      if (albedo.colorSpace !== 'sRGB' || !sameStringMapping(albedo.channels, { r: 'base-color-r', g: 'base-color-g', b: 'base-color-b', a: 'opaque-one' })) errors.push(issue('error', 'TEXTURE_ALBEDO_PACKING_INVALID', `${at}.pairedMaps.albedo`, 'Albedo must be sRGB RGBA base color with opaque alpha.'));
      if (normalRoughness.colorSpace !== 'linear' || normalRoughness.tangentSpace !== true || !sameStringMapping(normalRoughness.channels, { r: 'normal-x', g: 'normal-y', b: 'normal-z', a: 'roughness' })) errors.push(issue('error', 'TEXTURE_NORMAL_ROUGHNESS_PACKING_INVALID', `${at}.pairedMaps.normalRoughness`, 'Normal/roughness must be linear tangent-space RGB normal with roughness in alpha.'));
    }

    const roleNames = new Set();
    if (!Array.isArray(pack.materialRoles) || pack.materialRoles.length === 0) errors.push(issue('error', 'TEXTURE_MATERIAL_ROLES_REQUIRED', `${at}.materialRoles`, 'Pack requires material roles.'));
    else for (let roleIndex = 0; roleIndex < pack.materialRoles.length; roleIndex += 1) {
      const role = pack.materialRoles[roleIndex];
      const roleAt = `${at}.materialRoles[${roleIndex}]`;
      validateExactObjectKeys(role, ['role', 'metersPerTile', 'pixelsPerMeter', 'plannedStem'], roleAt, errors);
      if (!isObject(role) || !TEXTURE_MATERIAL_ROLES.has(role.role)) errors.push(issue('error', 'TEXTURE_MATERIAL_ROLE_INVALID', `${roleAt}.role`, `Unsupported material role ${String(role?.role)}.`));
      else if (roleNames.has(role.role)) errors.push(issue('error', 'TEXTURE_MATERIAL_ROLE_DUPLICATE', `${roleAt}.role`, `Duplicate material role ${role.role}.`));
      else roleNames.add(role.role);
      if (!(Number.isFinite(role?.metersPerTile) && role.metersPerTile > 0 && Number.isFinite(role?.pixelsPerMeter) && role.pixelsPerMeter > 0) || Math.abs(role.metersPerTile * role.pixelsPerMeter - 2048) > 0.001) errors.push(issue('error', 'TEXTURE_TEXEL_SCALE_INVALID', roleAt, 'metersPerTile × pixelsPerMeter must equal the exact 2048-pixel sheet width.'));
      const expectedScale = TEXTURE_ROLE_SCALE[role?.role];
      if (expectedScale && (role.metersPerTile !== expectedScale[0] || role.pixelsPerMeter !== expectedScale[1])) errors.push(issue('error', 'TEXTURE_TEXEL_SCALE_PROFILE_MISMATCH', roleAt, `${role.role} must use ${expectedScale[0]}m per tile at ${expectedScale[1]} pixels/meter.`));
      if (typeof role?.plannedStem !== 'string' || !ID_RE.test(role.plannedStem)) errors.push(issue('error', 'TEXTURE_PLANNED_STEM_INVALID', `${roleAt}.plannedStem`, 'Planned stem must be lowercase snake_case.'));
    }
    const expectedRoles = new Set(coverageTargetIds.flatMap((targetId) => targetById.get(targetId)?.requiredMaterialRoles ?? []));
    for (const targetId of coverageTargetIds) for (const role of targetById.get(targetId)?.requiredMaterialRoles ?? []) if (!roleNames.has(role)) errors.push(issue('error', 'TEXTURE_TARGET_ROLE_UNPAIRED', `${at}.materialRoles`, `Pack ${pack.id} does not supply required role ${role} for ${targetId}.`));
    for (const role of roleNames) if (!expectedRoles.has(role)) errors.push(issue('error', 'TEXTURE_PACK_ROLE_OUT_OF_SCOPE', `${at}.materialRoles`, `Pack ${pack.id} declares role ${role} outside its coverage targets.`));

    validateExactObjectKeys(pack.runtimeEncoding, ['container', 'transcodeClass', 'mipmaps'], `${at}.runtimeEncoding`, errors);
    if (!isObject(pack.runtimeEncoding) || pack.runtimeEncoding.container !== 'KTX2' || pack.runtimeEncoding.transcodeClass !== 'BasisU-UASTC-or-equivalent' || pack.runtimeEncoding.mipmaps !== true) errors.push(issue('error', 'TEXTURE_RUNTIME_ENCODING_INVALID', `${at}.runtimeEncoding`, 'Runtime encoding requires KTX2, UASTC-class transcode quality, and mipmaps.'));
    const budget = textureBudgetContract(pack);
    validateExactObjectKeys(pack.anisotropyBudget, ['class', 'requestedMax', 'sharedBudgetRequired'], `${at}.anisotropyBudget`, errors);
    if (!isObject(pack.anisotropyBudget) || pack.anisotropyBudget.class !== budget?.anisotropyClass || !Number.isInteger(pack.anisotropyBudget.requestedMax) || pack.anisotropyBudget.requestedMax < 1 || pack.anisotropyBudget.requestedMax > 8 || pack.anisotropyBudget.sharedBudgetRequired !== true) errors.push(issue('error', 'TEXTURE_ANISOTROPY_BUDGET_INVALID', `${at}.anisotropyBudget`, 'Pack must use its domain shared anisotropy class with a 1x-8x cap.'));
    validateExactObjectKeys(pack.residencyBudget, ['strategy', 'maxResidentMaterialPairs', 'targetCompressedGpuMiB', 'evictOnContextSwitch'], `${at}.residencyBudget`, errors);
    if (!isObject(pack.residencyBudget) || pack.residencyBudget.strategy !== budget?.strategy || pack.residencyBudget.maxResidentMaterialPairs !== roleNames.size || pack.residencyBudget.targetCompressedGpuMiB !== roleNames.size * 8 || pack.residencyBudget.evictOnContextSwitch !== true) errors.push(issue('error', 'TEXTURE_RESIDENCY_BUDGET_INVALID', `${at}.residencyBudget`, 'Residency must match the domain strategy, one pair per role, 8 MiB compressed target per pair, and context-switch eviction.'));

    validateExactObjectKeys(pack.conceptReference, ['required', 'conceptIds', 'pixelsUsedAsTexture', 'cleanAuthoringRequired'], `${at}.conceptReference`, errors);
    if (!isObject(pack.conceptReference) || pack.conceptReference.required !== true || pack.conceptReference.cleanAuthoringRequired !== true || !Array.isArray(pack.conceptReference.conceptIds) || pack.conceptReference.conceptIds.length === 0) errors.push(issue('error', 'TEXTURE_CONCEPT_REFERENCE_REQUIRED', `${at}.conceptReference`, 'Pack requires at least one approved source concept and a clean-authoring declaration.'));
    else for (let conceptIndex = 0; conceptIndex < pack.conceptReference.conceptIds.length; conceptIndex += 1) if (!approvedConceptIds.has(pack.conceptReference.conceptIds[conceptIndex])) errors.push(issue('error', 'TEXTURE_CONCEPT_NOT_APPROVED', `${at}.conceptReference.conceptIds[${conceptIndex}]`, `Concept ${pack.conceptReference.conceptIds[conceptIndex]} is not approved source evidence.`));
    if (pack?.conceptReference?.pixelsUsedAsTexture !== false) errors.push(issue('error', 'TEXTURE_REFERENCE_PIXELS_FORBIDDEN', `${at}.conceptReference.pixelsUsedAsTexture`, 'Concept/reference pixels can guide authored materials but cannot be used as texture pixels.'));
    validateUniqueArray(pack?.conceptReference?.conceptIds, `${at}.conceptReference.conceptIds`, errors);

    validateExactObjectKeys(pack.seamProof, ['required', 'status', 'method', 'evidencePath'], `${at}.seamProof`, errors);
    if (!isObject(pack.seamProof) || pack.seamProof.required !== true || pack.seamProof.method !== 'four-way-offset-plus-3x3-tile') errors.push(issue('error', 'TEXTURE_SEAM_PROOF_REQUIRED', `${at}.seamProof`, 'Four-way offset plus 3x3 repeated-tile seam proof is required.'));
    validateExactObjectKeys(pack.mobileCapture, ['required', 'status', 'deviceClass', 'viewports', 'requirements', 'evidencePaths'], `${at}.mobileCapture`, errors);
    if (!isObject(pack.mobileCapture) || pack.mobileCapture.required !== true || pack.mobileCapture.deviceClass !== 'target-android-flagship' || !sameOrderedValues(pack.mobileCapture.viewports, TEXTURE_MOBILE_VIEWPORTS) || !sameOrderedValues(pack.mobileCapture.requirements, TEXTURE_MOBILE_REQUIREMENTS)) errors.push(issue('error', 'TEXTURE_MOBILE_CAPTURE_REQUIRED', `${at}.mobileCapture`, 'Matched phone portrait/landscape capture requirements must be declared in canonical order.'));

    if (!Array.isArray(pack.consumerIds) || pack.consumerIds.length === 0) errors.push(issue('error', 'TEXTURE_PACK_CONSUMERS_REQUIRED', `${at}.consumerIds`, 'Pack requires real source consumers.'));
    else for (let consumerIndex = 0; consumerIndex < pack.consumerIds.length; consumerIndex += 1) {
      const consumer = consumerById.get(pack.consumerIds[consumerIndex]);
      if (!consumer) errors.push(issue('error', 'TEXTURE_CONSUMER_REFERENCE_INVALID', `${at}.consumerIds[${consumerIndex}]`, `Unknown consumer ${pack.consumerIds[consumerIndex]}.`));
      else if (!consumer.domains.includes(pack.domain)) errors.push(issue('error', 'TEXTURE_CONSUMER_DOMAIN_MISMATCH', `${at}.consumerIds[${consumerIndex}]`, `Consumer ${consumer.id} does not support ${pack.domain}.`));
      for (const targetId of coverageTargetIds) if (targetById.has(targetId) && !(targetById.get(targetId).consumerIds ?? []).includes(consumer.id)) errors.push(issue('error', 'TEXTURE_PACK_CONSUMER_NOT_IN_TARGET', `${at}.consumerIds[${consumerIndex}]`, `Consumer ${consumer.id} is not declared by target ${targetId}.`));
    }
    validateUniqueArray(pack.consumerIds, `${at}.consumerIds`, errors);
    validateUniqueArray(pack?.mobileCapture?.viewports, `${at}.mobileCapture.viewports`, errors);
    validateUniqueArray(pack?.mobileCapture?.requirements, `${at}.mobileCapture.requirements`, errors);
    validateUniqueArray(pack?.mobileCapture?.evidencePaths, `${at}.mobileCapture.evidencePaths`, errors);
    if (!isRelativeRepoPath(pack.plannedDirectory)) errors.push(issue('error', 'TEXTURE_PLANNED_DIRECTORY_INVALID', `${at}.plannedDirectory`, 'Planned directory must be repository-relative.'));

    if (pack.status === 'PLANNED') {
      if (pack.approvedEvidence !== null) errors.push(issue('error', 'TEXTURE_PLANNED_EVIDENCE_FORBIDDEN', `${at}.approvedEvidence`, 'Planned packs cannot declare approved runtime evidence.'));
      if (pack.seamProof?.status !== 'PENDING' || pack.seamProof?.evidencePath !== null) errors.push(issue('error', 'TEXTURE_PLANNED_SEAM_STATUS_INVALID', `${at}.seamProof`, 'Planned packs must leave seam proof pending with no evidence path.'));
      if (pack.mobileCapture?.status !== 'PENDING' || !Array.isArray(pack.mobileCapture?.evidencePaths) || pack.mobileCapture.evidencePaths.length !== 0) errors.push(issue('error', 'TEXTURE_PLANNED_CAPTURE_STATUS_INVALID', `${at}.mobileCapture`, 'Planned packs must leave mobile capture pending with no evidence paths.'));
    } else if (pack.status === 'APPROVED') {
      if (pack.seamProof?.status !== 'VERIFIED' || !isRelativeRepoPath(pack.seamProof?.evidencePath)) errors.push(issue('error', 'TEXTURE_APPROVED_SEAM_EVIDENCE_REQUIRED', `${at}.seamProof`, 'Approved packs require verified repository-relative seam evidence.'));
      if (pack.mobileCapture?.status !== 'VERIFIED' || !Array.isArray(pack.mobileCapture?.evidencePaths) || pack.mobileCapture.evidencePaths.length < 2 || pack.mobileCapture.evidencePaths.some((path) => !isRelativeRepoPath(path))) errors.push(issue('error', 'TEXTURE_APPROVED_MOBILE_EVIDENCE_REQUIRED', `${at}.mobileCapture`, 'Approved packs require verified phone portrait and landscape evidence paths.'));
      if (!Array.isArray(pack.approvedEvidence) || pack.approvedEvidence.length !== roleNames.size) errors.push(issue('error', 'TEXTURE_APPROVED_PAIR_EVIDENCE_REQUIRED', `${at}.approvedEvidence`, 'Approved packs require one albedo/normal-roughness evidence pair per material role.'));
      else {
        const evidenceRoles = new Set();
        const evidencePaths = new Set();
        for (let evidenceIndex = 0; evidenceIndex < pack.approvedEvidence.length; evidenceIndex += 1) {
          const evidence = pack.approvedEvidence[evidenceIndex];
          const evidenceAt = `${at}.approvedEvidence[${evidenceIndex}]`;
          validateExactObjectKeys(evidence, ['role', 'albedo', 'normalRoughness'], evidenceAt, errors);
          if (!roleNames.has(evidence?.role) || evidenceRoles.has(evidence?.role)) errors.push(issue('error', 'TEXTURE_APPROVED_ROLE_EVIDENCE_INVALID', `${evidenceAt}.role`, 'Approved evidence role must be unique and match a declared material role.'));
          if (evidence?.role) evidenceRoles.add(evidence.role);
          if (!isObject(evidence) || !isObject(evidence.albedo) || !isObject(evidence.normalRoughness)) errors.push(issue('error', 'TEXTURE_PAIR_REQUIRED', evidenceAt, 'Approved evidence requires both albedo and normal/roughness files.'));
          else {
            if (evidence.albedo.path === evidence.normalRoughness.path) errors.push(issue('error', 'TEXTURE_PAIR_PATHS_MUST_DIFFER', evidenceAt, 'Albedo and normal/roughness evidence must be distinct files.'));
            for (const path of [evidence.albedo.path, evidence.normalRoughness.path]) {
              if (evidencePaths.has(path)) errors.push(issue('error', 'TEXTURE_EVIDENCE_PATH_DUPLICATE', evidenceAt, `Approved texture evidence path is reused: ${path}`));
              if (typeof path === 'string') evidencePaths.add(path);
            }
            validateTextureEvidenceFile(evidence.albedo, `${evidenceAt}.albedo`, normalizedOptions, conceptSourcePaths, conceptSourceDigests, errors);
            validateTextureEvidenceFile(evidence.normalRoughness, `${evidenceAt}.normalRoughness`, normalizedOptions, conceptSourcePaths, conceptSourceDigests, errors);
          }
        }
      }
      if (normalizedOptions.checkFiles) {
        for (const path of [pack.seamProof?.evidencePath, ...(pack.mobileCapture?.evidencePaths ?? [])]) if (isRelativeRepoPath(path) && !existsSync(resolve(normalizedOptions.repoRoot, path))) errors.push(issue('error', 'TEXTURE_QA_EVIDENCE_MISSING', at, `QA evidence is not present: ${path}`));
      }
    }
  }

  for (let index = 0; index < (Array.isArray(catalog.targets) ? catalog.targets.length : 0); index += 1) {
    const target = catalog.targets[index];
    for (let packIndex = 0; packIndex < (target?.requiredPackIds ?? []).length; packIndex += 1) {
      const packId = target.requiredPackIds[packIndex];
      const pack = packById.get(packId);
      if (!pack) errors.push(issue('error', 'TEXTURE_TARGET_PACK_MISSING', `targets[${index}].requiredPackIds[${packIndex}]`, `Required pack ${packId} is missing.`));
      else if (!(pack.coverageTargetIds ?? []).includes(target.id)) errors.push(issue('error', 'TEXTURE_TARGET_PACK_BACKLINK_MISSING', `targets[${index}].requiredPackIds[${packIndex}]`, `Pack ${packId} does not link back to target ${target.id}.`));
    }
  }
  const requiredPackIds = new Set((Array.isArray(catalog.targets) ? catalog.targets : []).flatMap((target) => target?.requiredPackIds ?? []));
  for (const packId of packById.keys()) if (!requiredPackIds.has(packId)) errors.push(issue('error', 'TEXTURE_PACK_UNASSIGNED', 'packs', `Pack ${packId} is not required by a bounded texture target.`));

  if (normalizedOptions.checkFiles && !normalizedOptions.skipReportCheck && isRelativeRepoPath(catalog.reportPath)) {
    const absoluteReport = resolve(normalizedOptions.repoRoot, catalog.reportPath);
    if (!existsSync(absoluteReport)) errors.push(issue('error', 'TEXTURE_REPORT_MISSING', 'reportPath', `Texture report is not present: ${catalog.reportPath}`));
    else if (readFileSync(absoluteReport, 'utf8').replace(/\r\n/g, '\n') !== renderTextureThemeCoverageReport(catalog)) errors.push(issue('error', 'TEXTURE_REPORT_STALE', 'reportPath', 'Human-readable texture coverage report does not match the catalog.'));
  }
  const sortIssues = (a, b) => `${a.location}:${a.code}`.localeCompare(`${b.location}:${b.code}`);
  errors.sort(sortIssues);
  warnings.sort(sortIssues);
  return { ok: errors.length === 0, errors, warnings };
}

export function validateConceptCatalog(catalog, options = {}) {
  const errors = [];
  const warnings = [];
  const normalizedOptions = { checkFiles: false, repoRoot: REPO_ROOT, ...options };
  if (!isObject(catalog)) return { ok: false, errors: [issue('error', 'CONCEPT_CATALOG_INVALID', '$', 'Concept catalog root must be an object.')], warnings };
  if (catalog.schemaRef !== './assets.v1.schema.json#/$defs/conceptCatalog') errors.push(issue('error', 'CONCEPT_SCHEMA_REFERENCE_INVALID', 'schemaRef', 'Unexpected concept schema reference.'));
  if (catalog.schemaVersion !== 1) errors.push(issue('error', 'CONCEPT_SCHEMA_VERSION_INVALID', 'schemaVersion', 'Expected schemaVersion 1.'));
  if (catalog.catalogId !== 'massfront-concept-reference-library') errors.push(issue('error', 'CONCEPT_CATALOG_ID_INVALID', 'catalogId', 'Unexpected concept catalog id.'));
  const vocab = catalog.controlledVocabulary;
  if (!isObject(vocab)) {
    errors.push(issue('error', 'VOCABULARY_MISSING', 'controlledVocabulary', 'Controlled vocabulary is required.'));
  } else {
    validateVocabularyList(vocab.contentCategory, CONTENT_CATEGORIES, 'controlledVocabulary.contentCategory', errors);
    validateVocabularyList(vocab.faction, FACTIONS, 'controlledVocabulary.faction', errors);
    validateVocabularyList(vocab.biomeOrBiodome, BIOMES, 'controlledVocabulary.biomeOrBiodome', errors);
    validateVocabularyList(vocab.intention, INTENTIONS, 'controlledVocabulary.intention', errors);
    validateVocabularyList(vocab.camera, CAMERAS, 'controlledVocabulary.camera', errors);
    validateVocabularyList(vocab.scale, SCALES, 'controlledVocabulary.scale', errors);
    validateVocabularyList(vocab.lodProfile, LOD_PROFILES, 'controlledVocabulary.lodProfile', errors);
    validateVocabularyList(vocab.runtimeConsumer, RUNTIME_CONSUMERS, 'controlledVocabulary.runtimeConsumer', errors);
    validateVocabularyList(vocab.productionBiomeOrBiodome, PRODUCTION_BIOMES, 'controlledVocabulary.productionBiomeOrBiodome', errors);
    validateVocabularyList(vocab.productionFaction, PRODUCTION_FACTIONS, 'controlledVocabulary.productionFaction', errors);
    validateVocabularyList(vocab.modelIntention, MODEL_INTENTIONS, 'controlledVocabulary.modelIntention', errors);
    validateVocabularyList(vocab.forceRelationshipRole, FORCE_RELATIONSHIP_ROLES, 'controlledVocabulary.forceRelationshipRole', errors);
  }
  const sources = catalog.vocabularySources;
  for (const [axis, paths] of Object.entries(isObject(sources) ? sources : {})) {
    if (!Array.isArray(paths) || paths.length === 0) errors.push(issue('error', 'VOCABULARY_SOURCE_MISSING', `vocabularySources.${axis}`, 'Vocabulary source paths are required.'));
    else paths.forEach((path, index) => {
      if (!isRelativeRepoPath(path)) errors.push(issue('error', 'VOCABULARY_SOURCE_PATH_INVALID', `vocabularySources.${axis}[${index}]`, 'Vocabulary source must be repository-relative.'));
    });
  }
  const ids = new Set();
  if (!Array.isArray(catalog.concepts)) errors.push(issue('error', 'CONCEPTS_MISSING', 'concepts', 'Concepts must be an array.'));
  else catalog.concepts.forEach((record, index) => {
    if (ids.has(record?.id)) errors.push(issue('error', 'CONCEPT_ID_DUPLICATE', `concepts[${index}].id`, `Duplicate concept id ${String(record?.id)}.`));
    if (record?.id) ids.add(record.id);
    validateConceptShape(record, index, false, normalizedOptions, errors, warnings);
  });
  if (!Array.isArray(catalog.plannedBriefs)) errors.push(issue('error', 'PLANNED_BRIEFS_MISSING', 'plannedBriefs', 'Planned briefs must be an array.'));
  else catalog.plannedBriefs.forEach((record, index) => {
    if (ids.has(record?.id)) errors.push(issue('error', 'CONCEPT_ID_DUPLICATE', `plannedBriefs[${index}].id`, `Duplicate concept id ${String(record?.id)}.`));
    if (record?.id) ids.add(record.id);
    validateConceptShape(record, index, true, normalizedOptions, errors, warnings);
  });
  for (let index = 0; index < (Array.isArray(catalog.concepts) ? catalog.concepts.length : 0); index += 1) {
    const concept = catalog.concepts[index];
    if (concept?.status !== 'REJECTED' || !isObject(concept.canonicalDisposition)) continue;
    const replacementConceptId = concept.canonicalDisposition.replacementConceptId;
    const replacementBriefId = concept.canonicalDisposition.replacementBriefId;
    if (typeof replacementConceptId === 'string') {
      const replacement = catalog.concepts.find((record) => record?.id === replacementConceptId);
      if (replacement?.status !== 'APPROVED') errors.push(issue('error', 'REPLACEMENT_CONCEPT_NOT_APPROVED', `concepts[${index}].canonicalDisposition.replacementConceptId`, `Replacement concept ${replacementConceptId} must exist and be APPROVED.`));
    }
    if (typeof replacementBriefId === 'string') {
      const replacement = catalog.plannedBriefs.find((record) => record?.id === replacementBriefId);
      if (replacement?.status !== 'PLANNED') errors.push(issue('error', 'REPLACEMENT_BRIEF_NOT_PLANNED', `concepts[${index}].canonicalDisposition.replacementBriefId`, `Replacement brief ${replacementBriefId} must exist and remain PLANNED.`));
    }
  }
  validateProductionCoverage(catalog, normalizedOptions, errors);
  const sortIssues = (a, b) => `${a.location}:${a.code}`.localeCompare(`${b.location}:${b.code}`);
  errors.sort(sortIssues);
  warnings.sort(sortIssues);
  return { ok: errors.length === 0, errors, warnings };
}

export function validateRegistryCatalogLinks(registry, catalog) {
  const errors = [];
  const concepts = new Map((Array.isArray(catalog?.concepts) ? catalog.concepts : []).map((record) => [record?.id, record]));
  for (let index = 0; index < (Array.isArray(registry?.assets) ? registry.assets.length : 0); index += 1) {
    const asset = registry.assets[index];
    const runtimeApproval = asset?.representation === '3d-model' && (asset?.lifecycle?.runtimeReady === true || asset?.approval?.status === 'APPROVED');
    if (!runtimeApproval || !asset?.conceptEvidence?.conceptId) continue;
    const at = `assets[${index}].conceptEvidence`;
    const concept = concepts.get(asset.conceptEvidence.conceptId);
    if (!concept) {
      errors.push(issue('error', 'RUNTIME_CONCEPT_CATALOG_REQUIRED', `${at}.conceptId`, `Approved model concept ${asset.conceptEvidence.conceptId} is not in the authoritative concept catalog.`));
      continue;
    }
    if (concept.status !== 'APPROVED' || concept.evidence?.approvalStatus !== 'APPROVED') {
      errors.push(issue('error', 'RUNTIME_CONCEPT_CATALOG_APPROVAL_REQUIRED', `${at}.conceptId`, `Concept ${concept.id} is not approved in the authoritative catalog.`));
    }
    for (const field of ['sourcePath', 'bytes']) {
      if (asset.conceptEvidence[field] !== concept.evidence?.[field]) errors.push(issue('error', 'RUNTIME_CONCEPT_EVIDENCE_MISMATCH', `${at}.${field}`, `Model concept ${field} does not match catalog evidence.`));
    }
    if (JSON.stringify(asset.conceptEvidence.resolution ?? null) !== JSON.stringify(concept.evidence?.resolution ?? null)) {
      errors.push(issue('error', 'RUNTIME_CONCEPT_EVIDENCE_MISMATCH', `${at}.resolution`, 'Model concept resolution does not match catalog evidence.'));
    }
    if (asset.conceptEvidence.integrity?.digest !== concept.evidence?.integrity?.digest) {
      errors.push(issue('error', 'RUNTIME_CONCEPT_EVIDENCE_MISMATCH', `${at}.integrity.digest`, 'Model concept digest does not match catalog evidence.'));
    }
  }
  errors.sort((a, b) => `${a.location}:${a.code}`.localeCompare(`${b.location}:${b.code}`));
  return { ok: errors.length === 0, errors, warnings: [] };
}

export function validateRegistry(registry, options = {}) {
  const errors = [];
  const warnings = [];
  const normalizedOptions = { checkFiles: false, repoRoot: REPO_ROOT, ...options };
  if (!isObject(registry)) {
    return { ok: false, errors: [issue('error', 'REGISTRY_INVALID', '$', 'Registry root must be an object.')], warnings };
  }
  if (registry.$schema !== './assets.v1.schema.json') errors.push(issue('error', 'SCHEMA_REFERENCE_INVALID', '$schema', 'Expected ./assets.v1.schema.json.'));
  if (registry.schemaVersion !== 1) errors.push(issue('error', 'SCHEMA_VERSION_INVALID', 'schemaVersion', 'Expected schemaVersion 1.'));
  if (registry.libraryId !== 'massfront-content-library') errors.push(issue('error', 'LIBRARY_ID_INVALID', 'libraryId', 'Expected massfront-content-library.'));

  const styleIds = new Set();
  if (!Array.isArray(registry.styleProfiles) || registry.styleProfiles.length === 0) {
    errors.push(issue('error', 'STYLE_PROFILES_MISSING', 'styleProfiles', 'At least one style profile is required.'));
  } else {
    for (let index = 0; index < registry.styleProfiles.length; index += 1) {
      const profile = registry.styleProfiles[index];
      if (!isObject(profile) || typeof profile.id !== 'string' || !STYLE_ID_RE.test(profile.id)) {
        errors.push(issue('error', 'STYLE_PROFILE_INVALID', `styleProfiles[${index}]`, 'Style profile id must be lowercase kebab-case.'));
        continue;
      }
      if (styleIds.has(profile.id)) errors.push(issue('error', 'STYLE_PROFILE_DUPLICATE', `styleProfiles[${index}].id`, `Duplicate style profile ${profile.id}.`));
      styleIds.add(profile.id);
    }
  }

  const assetIds = new Set();
  if (!Array.isArray(registry.assets)) {
    errors.push(issue('error', 'ASSETS_MISSING', 'assets', 'assets must be an array.'));
  } else {
    for (let index = 0; index < registry.assets.length; index += 1) {
      const asset = registry.assets[index];
      if (isObject(asset) && typeof asset.id === 'string') {
        if (assetIds.has(asset.id)) errors.push(issue('error', 'ASSET_ID_DUPLICATE', `assets[${index}].id`, `Duplicate asset id ${asset.id}.`));
        assetIds.add(asset.id);
      }
      validateAsset(asset, index, styleIds, normalizedOptions, errors, warnings);
    }
  }

  const sortIssues = (a, b) => `${a.location}:${a.code}`.localeCompare(`${b.location}:${b.code}`);
  errors.sort(sortIssues);
  warnings.sort(sortIssues);
  return { ok: errors.length === 0, errors, warnings };
}

export function loadAndValidateRegistry(registryPath = DEFAULT_REGISTRY, options = {}) {
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      errors: [issue('error', 'REGISTRY_READ_FAILED', registryPath, error.message)],
      warnings: []
    };
  }
  return validateRegistry(registry, options);
}

export function loadAndValidateConceptCatalog(catalogPath = DEFAULT_CONCEPT_CATALOG, options = {}) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      errors: [issue('error', 'CONCEPT_CATALOG_READ_FAILED', catalogPath, error.message)],
      warnings: []
    };
  }
  return validateConceptCatalog(catalog, options);
}

export function loadAndValidateTextureThemeCatalog(textureCatalogPath = DEFAULT_TEXTURE_CATALOG, conceptCatalog = {}, options = {}) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(textureCatalogPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      errors: [issue('error', 'TEXTURE_CATALOG_READ_FAILED', textureCatalogPath, error.message)],
      warnings: []
    };
  }
  return validateTextureThemeCatalog(catalog, conceptCatalog, options);
}

function parseArgs(argv) {
  const args = [...argv];
  const output = { registryPath: DEFAULT_REGISTRY, catalogPath: DEFAULT_CONCEPT_CATALOG, textureCatalogPath: DEFAULT_TEXTURE_CATALOG, checkFiles: false, json: false, writeCoverageReport: false, writeTextureReport: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check-files') output.checkFiles = true;
    else if (arg === '--json') output.json = true;
    else if (arg === '--write-coverage-report') output.writeCoverageReport = true;
    else if (arg === '--write-texture-report') output.writeTextureReport = true;
    else if (arg === '--catalog') {
      index += 1;
      if (!args[index]) throw new Error('--catalog requires a path');
      output.catalogPath = resolve(args[index]);
    }
    else if (arg === '--texture-catalog') {
      index += 1;
      if (!args[index]) throw new Error('--texture-catalog requires a path');
      output.textureCatalogPath = resolve(args[index]);
    }
    else if (!arg.startsWith('--')) output.registryPath = resolve(arg);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return output;
}

function runCli() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`CONTENT_LIBRARY FAIL ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (args.writeCoverageReport) {
    try {
      const catalog = JSON.parse(readFileSync(args.catalogPath, 'utf8'));
      const preflight = validateConceptCatalog(catalog, { checkFiles: false, repoRoot: REPO_ROOT });
      if (!preflight.ok || !isRelativeRepoPath(catalog?.productionCoverage?.reportPath)) throw new Error('catalog must pass validation before its coverage report can be written');
      const reportPath = resolve(REPO_ROOT, catalog.productionCoverage.reportPath);
      writeFileSync(reportPath, renderProductionCoverageReport(catalog), 'utf8');
    } catch (error) {
      console.error(`CONTENT_LIBRARY FAIL ${error.message}`);
      process.exitCode = 2;
      return;
    }
  }
  if (args.writeTextureReport) {
    try {
      const conceptCatalog = JSON.parse(readFileSync(args.catalogPath, 'utf8'));
      const textureCatalog = JSON.parse(readFileSync(args.textureCatalogPath, 'utf8'));
      const preflight = validateTextureThemeCatalog(textureCatalog, conceptCatalog, { checkFiles: true, skipReportCheck: true, repoRoot: REPO_ROOT });
      if (!preflight.ok || !isRelativeRepoPath(textureCatalog?.reportPath)) throw new Error('texture catalog must pass validation before its coverage report can be written');
      const reportPath = resolve(REPO_ROOT, textureCatalog.reportPath);
      writeFileSync(reportPath, renderTextureThemeCoverageReport(textureCatalog), 'utf8');
    } catch (error) {
      console.error(`CONTENT_LIBRARY FAIL ${error.message}`);
      process.exitCode = 2;
      return;
    }
  }
  const registryResult = loadAndValidateRegistry(args.registryPath, { checkFiles: args.checkFiles, repoRoot: REPO_ROOT });
  const catalogResult = loadAndValidateConceptCatalog(args.catalogPath, { checkFiles: args.checkFiles, repoRoot: REPO_ROOT });
  let conceptCatalog = {};
  try {
    conceptCatalog = JSON.parse(readFileSync(args.catalogPath, 'utf8'));
  } catch {
    // The concept loader reports its own read/parse error.
  }
  const textureResult = loadAndValidateTextureThemeCatalog(args.textureCatalogPath, conceptCatalog, { checkFiles: args.checkFiles, repoRoot: REPO_ROOT });
  let linkResult = { ok: true, errors: [], warnings: [] };
  if (registryResult.ok && catalogResult.ok) {
    try {
      const registry = JSON.parse(readFileSync(args.registryPath, 'utf8'));
      const catalog = JSON.parse(readFileSync(args.catalogPath, 'utf8'));
      linkResult = validateRegistryCatalogLinks(registry, catalog);
    } catch {
      // The individual loaders already report read and parse failures.
    }
  }
  const result = {
    ok: registryResult.ok && catalogResult.ok && textureResult.ok && linkResult.ok,
    errors: [
      ...registryResult.errors.map((entry) => ({ ...entry, location: `registry.${entry.location}` })),
      ...catalogResult.errors.map((entry) => ({ ...entry, location: `catalog.${entry.location}` })),
      ...textureResult.errors.map((entry) => ({ ...entry, location: `textures.${entry.location}` })),
      ...linkResult.errors.map((entry) => ({ ...entry, location: `links.${entry.location}` }))
    ],
    warnings: [
      ...registryResult.warnings.map((entry) => ({ ...entry, location: `registry.${entry.location}` })),
      ...catalogResult.warnings.map((entry) => ({ ...entry, location: `catalog.${entry.location}` })),
      ...textureResult.warnings.map((entry) => ({ ...entry, location: `textures.${entry.location}` })),
      ...linkResult.warnings.map((entry) => ({ ...entry, location: `links.${entry.location}` }))
    ]
  };
  if (args.json) {
    console.log(JSON.stringify({ registry: args.registryPath, conceptCatalog: args.catalogPath, textureCatalog: args.textureCatalogPath, ...result }, null, 2));
  } else {
    for (const entry of result.errors) console.error(`ERROR ${entry.code} ${entry.location}: ${entry.message}`);
    for (const entry of result.warnings) console.warn(`WARN  ${entry.code} ${entry.location}: ${entry.message}`);
    console.log(`CONTENT_LIBRARY ${result.ok ? 'PASS' : 'FAIL'} errors=${result.errors.length} warnings=${result.warnings.length}`);
  }
  if (!result.ok) process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runCli();
