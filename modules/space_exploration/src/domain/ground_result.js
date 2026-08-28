import { MISSION_CATALOG, RESOURCE_KEYS } from './catalog.js';
import { clamp, deepClone, deepFreeze, deterministicUnit, hash32, stableStringify } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { validateGroundOperation } from './ground_operation.js';
import { assertDomainState } from './state_store.js';
import { advanceExpeditionCycles } from './construction.js';

export const GROUND_RESULT_SCHEMA_VERSION = 2;

const OUTCOMES = new Set(['victory', 'partial', 'setback']);
const INJURY_BANDS = new Set(['none', 'light', 'moderate', 'severe']);
const INJURY_BAND_ORDER = ['none', 'light', 'moderate', 'severe'];

function validateReport(operation, report) {
  const issues = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) return { ok: false, issues: [issue('GROUND_REPORT_NOT_OBJECT', 'Ground report must be an object.')] };
  if (!OUTCOMES.has(report.outcome)) issues.push(issue('OUTCOME_INVALID', 'Ground report outcome is invalid.', 'outcome'));
  if (!Number.isInteger(report.score) || report.score < 0 || report.score > 100) issues.push(issue('SCORE_INVALID', 'Ground report score must be an integer from 0 to 100.', 'score'));
  if (typeof report.primaryObjectiveComplete !== 'boolean') issues.push(issue('PRIMARY_OBJECTIVE_INVALID', 'Primary objective completion must be boolean.', 'primaryObjectiveComplete'));
  if (!Number.isInteger(report.secondaryObjectivesComplete) || report.secondaryObjectivesComplete < 0 || report.secondaryObjectivesComplete > 3) issues.push(issue('SECONDARY_OBJECTIVES_INVALID', 'Secondary objective count must be from 0 to 3.', 'secondaryObjectivesComplete'));
  const injuryBand = report.injuryBand || report.casualtyBand;
  if (!INJURY_BANDS.has(injuryBand)) issues.push(issue('INJURY_BAND_INVALID', 'Ground report injury band is invalid.', 'injuryBand'));
  if (!Array.isArray(report.injuredPersonnelIds)) issues.push(issue('INJURED_PERSONNEL_INVALID', 'Injured personnel IDs must be an array.', 'injuredPersonnelIds'));
  else {
    const validIds = new Set([operation.commanderId, ...operation.specialistIds]);
    if (new Set(report.injuredPersonnelIds).size !== report.injuredPersonnelIds.length || report.injuredPersonnelIds.some(id => !validIds.has(id))) issues.push(issue('INJURED_PERSONNEL_INVALID', 'Injured personnel must be unique members of the deployed team.', 'injuredPersonnelIds'));
    if (injuryBand === 'none' && report.injuredPersonnelIds.length) issues.push(issue('INJURY_BAND_CONFLICT', 'No personnel can be injured when the injury band is none.', 'injuredPersonnelIds'));
  }
  if (Array.isArray(report.deadPersonnelIds) && report.deadPersonnelIds.length) issues.push(issue('PERMANENT_DEATH_UNSUPPORTED', 'Permanent personnel death is excluded from this experiment.', 'deadPersonnelIds'));
  if (report.outcome === 'victory' && report.primaryObjectiveComplete !== true) issues.push(issue('VICTORY_WITHOUT_OBJECTIVE', 'Victory requires the primary objective.', 'primaryObjectiveComplete'));
  if (report.outcome === 'setback' && report.primaryObjectiveComplete !== false) issues.push(issue('SETBACK_WITH_OBJECTIVE', 'A completed primary objective cannot be a setback.', 'primaryObjectiveComplete'));
  return { ok: issues.length === 0, issues };
}

function normalizedReport(report) {
  return {
    outcome: report.outcome,
    score: report.score,
    primaryObjectiveComplete: report.primaryObjectiveComplete,
    secondaryObjectivesComplete: report.secondaryObjectivesComplete,
    injuryBand: report.injuryBand || report.casualtyBand,
    injuredPersonnelIds: [...report.injuredPersonnelIds]
  };
}

function outcomeMultiplier(outcome) {
  if (outcome === 'victory') return 1;
  if (outcome === 'partial') return 0.58;
  return 0.22;
}

function buildRewards(operation, report) {
  const multiplier = outcomeMultiplier(report.outcome);
  const performance = 0.82 + report.score / 480;
  const rewards = {};
  for (const key of RESOURCE_KEYS) rewards[key] = Math.max(0, Math.round((operation.rewardPlan[key] || 0) * multiplier * performance));
  if (operation.supportId === 'field_lab') {
    rewards.researchPoints = Math.round(rewards.researchPoints * 1.15);
    rewards.bioSamples = Math.round(rewards.bioSamples * 1.1);
  }
  if (operation.supportId === 'survey_drones') rewards.probes += report.secondaryObjectivesComplete > 1 ? 1 : 0;
  const effects = operation.configuration?.facilityEffects || {};
  if (effects.operationResearchRewardPct) rewards.researchPoints = Math.floor(rewards.researchPoints * (100 + effects.operationResearchRewardPct) / 100);
  if (effects.materialRewardPct) {
    rewards.alloys = Math.floor(rewards.alloys * (100 + effects.materialRewardPct) / 100);
    rewards.components = Math.floor(rewards.components * (100 + effects.materialRewardPct) / 100);
  }
  if (effects.bioRewardPct) rewards.bioSamples = Math.floor(rewards.bioSamples * (100 + effects.bioRewardPct) / 100);
  if (report.outcome === 'victory') {
    rewards.probes += effects.victoryProbeRestore || 0;
    rewards.fuel += effects.victoryFuelRestore || 0;
  }
  return rewards;
}

function effectiveInjuryBand(operation, report, personnelId = null) {
  const effects = operation.configuration?.facilityEffects || {};
  const globalReduction = Math.abs(Math.min(0, effects.injurySeverityBands || 0));
  const forecastReduction = personnelId && personnelId === report.injuredPersonnelIds[0] ? (effects.casualtyForecast || 0) : 0;
  const index = Math.max(0, INJURY_BAND_ORDER.indexOf(report.injuryBand) - globalReduction - forecastReduction);
  return INJURY_BAND_ORDER[index];
}

function injuryCycles(operation, report, personnelId = null) {
  const band = effectiveInjuryBand(operation, report, personnelId);
  const base = { none: 0, light: 1, moderate: 2, severe: 3 }[band];
  const effects = operation.configuration?.facilityEffects || {};
  const supportReduction = operation.supportId === 'medevac' ? 1 : 0;
  const recoveryReduction = Math.abs(Math.min(0, effects.personnelRecoveryCycles || 0));
  return Math.max(0, base - supportReduction - recoveryReduction);
}

function buildFactionDelta(operation, report) {
  const multiplier = outcomeMultiplier(report.outcome);
  const effects = operation.configuration?.facilityEffects || {};
  const longestInjury = report.injuredPersonnelIds.reduce((maximum, id) => Math.max(maximum, injuryCycles(operation, report, id)), 0);
  const recoveryCycles = report.injuredPersonnelIds.length ? Math.max(0, longestInjury + Math.min(0, effects.factionRecoveryCycles || 0)) : 0;
  const reputation = Math.round((operation.rewardPlan.reputation || 0) * multiplier);
  const loyalty = report.outcome === 'victory' ? 3 : report.outcome === 'partial' ? 1 : -2;
  return {
    reputation: Math.floor(reputation * (100 + (effects.factionReputationPct || 0)) / 100),
    loyalty: loyalty > 0 ? Math.floor(loyalty * (100 + (effects.factionLoyaltyPct || 0)) / 100) : loyalty,
    readiness: report.injuryBand === 'none' ? -7 : report.injuryBand === 'light' ? -13 : report.injuryBand === 'moderate' ? -22 : -32,
    recoveryCycles
  };
}

function buildPersonnelDelta(operation, report) {
  const xp = report.outcome === 'victory' ? 42 + report.secondaryObjectivesComplete * 6 : report.outcome === 'partial' ? 24 : 12;
  const loyalty = report.outcome === 'victory' ? 2 : report.outcome === 'partial' ? 0 : -1;
  const injuryType = operation.missionType === 'uga_brood_purge' ? 'brood_exposure_trauma' : 'operational_trauma';
  const readinessFor = band => band === 'none' ? -8 : band === 'light' ? -15 : band === 'moderate' ? -25 : -38;
  const delta = (id, experience) => {
    const band = effectiveInjuryBand(operation, report, id);
    const cycles = injuryCycles(operation, report, id);
    const injured = report.injuredPersonnelIds.includes(id) && cycles > 0;
    return { id, experience, loyalty, readiness: readinessFor(injured ? band : report.injuryBand), injury: injured ? { type: injuryType, severity: band, recoveryCycles: cycles } : null };
  };
  return {
    commander: delta(operation.commanderId, xp),
    specialists: operation.specialistIds.map(id => delta(id, Math.round(xp * 0.75)))
  };
}

function buildWorldDelta(operation, report) {
  if (operation.missionType !== 'uga_brood_purge') return { infestationSeverity: 0, hiveTargetsPurged: [], infestationCleared: false };
  let infestationSeverity;
  if (report.outcome === 'victory') infestationSeverity = -(15 + operation.difficulty * 5);
  else if (report.outcome === 'partial') infestationSeverity = -(5 + operation.difficulty * 2);
  else infestationSeverity = 3 + operation.difficulty;
  return {
    infestationSeverity,
    hiveTargetsPurged: report.primaryObjectiveComplete ? [...operation.battlefield.hiveTargetIds] : [],
    infestationCleared: operation.missionId === 'uga_hive_heart' && report.outcome === 'victory'
  };
}

function buildGroundResult(operation, report) {
  const result = {
    schemaVersion: GROUND_RESULT_SCHEMA_VERSION,
    kind: 'GroundResult',
    operationId: operation.operationId,
    returnToken: operation.returnToken,
    returnRoute: deepClone(operation.returnRoute),
    missionId: operation.missionId,
    sponsorId: operation.sponsorId,
    proxyFactionId: operation.proxyFactionId,
    playerFactionId: operation.proxyFactionId,
    opponentFactionId: operation.opponentFactionId,
    commanderId: operation.commanderId,
    specialistIds: [...operation.specialistIds],
    outcome: report.outcome,
    score: report.score,
    primaryObjectiveComplete: report.primaryObjectiveComplete,
    secondaryObjectivesComplete: report.secondaryObjectivesComplete,
    injuryBand: report.injuryBand,
    casualtyBand: report.injuryBand,
    injuredPersonnelIds: [...report.injuredPersonnelIds],
    deadPersonnelIds: [],
    rewards: buildRewards(operation, report),
    factionDelta: buildFactionDelta(operation, report),
    personnelDelta: buildPersonnelDelta(operation, report),
    worldDelta: buildWorldDelta(operation, report),
    missionDelta: { completed: report.outcome === 'victory' }
  };
  result.resultId = `gr_${String(operation.sequence).padStart(4, '0')}_${hash32({ resultSeed: operation.resultSeed, result })}`;
  return result;
}

export function createGroundResult(operation, report) {
  const operationValidation = validateGroundOperation(operation);
  const reportValidation = validateReport(operation, report);
  const issues = [...operationValidation.issues, ...reportValidation.issues];
  if (issues.length) throw new DomainValidationError('GroundResult input is invalid.', issues, 'GROUND_RESULT_INPUT_INVALID');
  return deepFreeze(buildGroundResult(operation, normalizedReport(report)));
}

function deterministicInjuries(operation, injuryBand, score) {
  if (injuryBand === 'none') return [];
  const team = [operation.commanderId, ...operation.specialistIds];
  const count = injuryBand === 'light' ? 1 : injuryBand === 'moderate' ? 2 : Math.min(3, 1 + Math.floor((100 - score) / 18));
  return [...team]
    .sort((a, b) => deterministicUnit(operation.resultSeed, `injury:${a}`) - deterministicUnit(operation.resultSeed, `injury:${b}`))
    .slice(0, count);
}

export function simulateGroundResult(operation) {
  const validation = validateGroundOperation(operation);
  if (!validation.ok) throw new DomainValidationError('Cannot simulate an invalid GroundOperation.', validation.issues);
  const commander = operation.personnelSnapshot.commander;
  const specialistRating = operation.personnelSnapshot.specialists.reduce((sum, specialist) => sum + specialist.rating, 0);
  const averageSpecialistReadiness = operation.personnelSnapshot.specialists.reduce((sum, specialist) => sum + specialist.readiness, 0) / 3;
  let score = 54;
  score -= operation.difficulty * 6;
  score += operation.intelligence.level * 4;
  score += Math.floor(operation.factionSnapshot.readiness / 14);
  score += Math.floor(operation.factionSnapshot.reputation / 12);
  score += commander.level * 3;
  score += Math.floor(commander.loyalty / 25);
  score += specialistRating;
  score += Math.floor(averageSpecialistReadiness / 25);
  if (operation.doctrineId === 'methodical') score += 7;
  else if (operation.doctrineId === 'rapid') score += 2;
  else if (operation.doctrineId === 'containment') score += operation.missionType === 'uga_brood_purge' ? 9 : 3;
  else if (operation.doctrineId === 'covert') score += 6;
  if (operation.supportId === 'survey_drones') score += 4;
  else if (operation.supportId === 'field_lab') score += 2;
  else if (operation.supportId === 'heavy_lift') score += 5;
  else if (operation.supportId === 'medevac') score += 1;
  score -= Math.round(operation.battlefield.threat * 0.09);
  score += Math.floor((deterministicUnit(operation.resultSeed, 'performance') - 0.5) * 31);
  score = clamp(Math.round(score), 0, 100);

  const outcome = score >= 66 ? 'victory' : score >= 41 ? 'partial' : 'setback';
  const primaryObjectiveComplete = outcome === 'victory' || (outcome === 'partial' && score >= 53);
  const secondaryObjectivesComplete = clamp(Math.floor(deterministicUnit(operation.resultSeed, 'secondary') * 3) + (score >= 84 ? 1 : 0), 0, 3);
  let injuryBand = score >= 80 ? 'none' : score >= 61 ? 'light' : score >= 40 ? 'moderate' : 'severe';
  if (operation.doctrineId === 'rapid' && injuryBand === 'none') injuryBand = 'light';
  const injuredPersonnelIds = deterministicInjuries(operation, injuryBand, score);
  return createGroundResult(operation, { outcome, score, primaryObjectiveComplete, secondaryObjectivesComplete, injuryBand, injuredPersonnelIds });
}

export function validateGroundResult(operation, result) {
  const issues = [...validateGroundOperation(operation).issues];
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    issues.push(issue('GROUND_RESULT_NOT_OBJECT', 'GroundResult must be an object.'));
    return { ok: false, issues };
  }
  if (result.schemaVersion !== GROUND_RESULT_SCHEMA_VERSION || result.kind !== 'GroundResult') issues.push(issue('GROUND_RESULT_VERSION_INVALID', 'GroundResult schema or kind is invalid.'));
  const report = normalizedReport(result);
  issues.push(...validateReport(operation, report).issues);
  if (result.operationId !== operation.operationId || result.returnToken !== operation.returnToken || stableStringify(result.returnRoute) !== stableStringify(operation.returnRoute)) issues.push(issue('RESULT_OPERATION_MISMATCH', 'GroundResult does not carry the operation identity and exact return route.', 'operationId'));
  if (result.sponsorId !== 'uga' || result.proxyFactionId !== operation.proxyFactionId || result.playerFactionId !== operation.proxyFactionId || result.opponentFactionId !== operation.opponentFactionId) issues.push(issue('RESULT_PARTICIPANTS_INVALID', 'GroundResult participants do not match the operation.', 'proxyFactionId'));
  if (Array.isArray(result.deadPersonnelIds) && result.deadPersonnelIds.length) issues.push(issue('PERMANENT_DEATH_UNSUPPORTED', 'Permanent personnel death is excluded from this experiment.', 'deadPersonnelIds'));
  if (!issues.length) {
    const expected = buildGroundResult(operation, report);
    if (stableStringify(result) !== stableStringify(expected)) issues.push(issue('GROUND_RESULT_PAYLOAD_INVALID', 'GroundResult payout, personnel effects, world effects, or deterministic ID does not match its report.'));
  }
  return { ok: issues.length === 0, issues };
}

function applyPersonnelDelta(person, delta) {
  person.experience += delta.experience;
  if (person.level !== undefined) person.level = Math.min(20, 1 + Math.floor(person.experience / 120));
  person.loyalty = clamp(person.loyalty + delta.loyalty, 0, 100);
  person.readiness = clamp(person.readiness + delta.readiness, 0, 100);
  person.injury = delta.injury ? deepClone(delta.injury) : null;
  person.status = person.injury ? 'recovering' : 'ready';
  person.operationsCompleted += 1;
}

export function applyGroundResult(state, result) {
  assertDomainState(state);
  if (result && state.operations.appliedResultIds.includes(result.resultId)) return { state, applied: false, reason: 'already_applied' };
  const operation = state.operations.pending;
  if (!operation || operation.operationId !== result?.operationId || operation.returnToken !== result?.returnToken) throw new DomainValidationError('GroundResult does not match the pending GroundOperation.', [issue('PENDING_OPERATION_MISMATCH', 'Result operation ID or return token does not match.', 'operationId')], 'PENDING_OPERATION_MISMATCH');
  const validation = validateGroundResult(operation, result);
  if (!validation.ok) throw new DomainValidationError('GroundResult is invalid.', validation.issues, 'GROUND_RESULT_INVALID');

  const next = deepClone(state);
  for (const key of RESOURCE_KEYS) next.resources[key] += result.rewards[key];
  const faction = next.factions[result.proxyFactionId];
  faction.reputation += result.factionDelta.reputation;
  faction.loyalty = clamp(faction.loyalty + result.factionDelta.loyalty, 0, 100);
  faction.readiness = clamp(faction.readiness + result.factionDelta.readiness, 0, 100);
  faction.recoveryCycles = result.factionDelta.recoveryCycles;
  faction.status = faction.recoveryCycles > 0 ? 'recovering' : 'ready';
  if (result.missionDelta.completed) faction.operationsCompleted += 1;

  applyPersonnelDelta(next.personnel.commanders[result.personnelDelta.commander.id], result.personnelDelta.commander);
  for (const delta of result.personnelDelta.specialists) applyPersonnelDelta(next.personnel.specialists[delta.id], delta);

  const mission = next.missions[result.missionId];
  if (result.missionDelta.completed) mission.completions += 1;
  mission.lastOutcome = result.outcome;
  mission.lastResultId = result.resultId;
  if (operation.missionType === 'uga_brood_purge') {
    const infestation = next.world.systems[operation.systemId].infestation;
    infestation.severity = clamp(infestation.severity + result.worldDelta.infestationSeverity, 0, 100);
    if (result.worldDelta.infestationCleared) {
      infestation.active = false;
      infestation.severity = 0;
      next.world.systems.karak.populationState = 'recovering';
      next.story.currentStep = 'karak_reclamation';
      if (!next.story.completedStepIds.includes('karak_reclamation')) next.story.completedStepIds.push('karak_reclamation');
    }
  }

  next.operations.appliedResultIds.push(result.resultId);
  next.operations.history.push({ operation: deepClone(operation), result: deepClone(result) });
  next.operations.pending = null;
  next.route = deepClone(operation.returnRoute);
  next.revision += 1;
  const advanced = advanceExpeditionCycles(next, 2, `operation:${result.resultId}`, 'operation');
  return { state: advanced.state, applied: true, reason: 'applied', construction: advanced.completedJobs };
}

function recoverPerson(person, cycles) {
  if (!person.injury) {
    if (person.status !== 'locked' && person.status !== 'deployed') person.status = 'ready';
    person.readiness = clamp(person.readiness + cycles * 4, 0, 100);
    return false;
  }
  person.injury.recoveryCycles = Math.max(0, person.injury.recoveryCycles - cycles);
  person.readiness = clamp(person.readiness + cycles * 8, 0, 100);
  if (person.injury.recoveryCycles === 0) {
    person.injury = null;
    person.status = 'ready';
  }
  return true;
}

export function advanceRecoveryCycles(state, cycles = 1) {
  assertDomainState(state);
  if (!Number.isInteger(cycles) || cycles < 1) throw new DomainValidationError('Recovery cycles must be a positive integer.', [issue('RECOVERY_CYCLES_INVALID', 'Expected one or more recovery cycles.', 'cycles')]);
  if (state.operations.pending) throw new DomainValidationError('Recovery cannot advance while a ground operation is pending.', [issue('OPERATION_PENDING', 'Resolve the pending operation first.', 'operations.pending')]);
  const next = deepClone(state);
  let changed = false;
  for (const person of Object.values(next.personnel.commanders)) changed = recoverPerson(person, cycles) || changed;
  for (const person of Object.values(next.personnel.specialists)) changed = recoverPerson(person, cycles) || changed;
  for (const faction of Object.values(next.factions)) {
    if (!faction.resident) continue;
    if (faction.recoveryCycles > 0) {
      faction.recoveryCycles = Math.max(0, faction.recoveryCycles - cycles);
      changed = true;
    }
    faction.readiness = clamp(faction.readiness + cycles * 7, 0, 100);
    faction.status = faction.recoveryCycles > 0 ? 'recovering' : 'ready';
  }
  if (!changed) return state;
  next.revision += 1;
  assertDomainState(next);
  return next;
}
