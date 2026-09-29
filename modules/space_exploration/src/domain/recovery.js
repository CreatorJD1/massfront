import { clamp, deepClone } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { assertDomainState } from './state_store.js';

function recoverPerson(person, cycles, holdNewInjury = false) {
  if (!person.injury) {
    if (person.status !== 'locked' && person.status !== 'deployed') person.status = 'ready';
    const before = person.readiness;
    person.readiness = clamp(person.readiness + cycles * 4, 0, 100);
    return person.readiness !== before;
  }
  if (!holdNewInjury) person.injury.recoveryCycles = Math.max(0, person.injury.recoveryCycles - cycles);
  person.readiness = clamp(person.readiness + cycles * 8, 0, 100);
  if (person.injury.recoveryCycles === 0) {
    person.injury = null;
    person.status = 'ready';
  }
  return true;
}

// Expedition events already have an idempotency ledger. Mutate their cloned state
// inside that transaction so a replay cannot heal a crew twice.
export function applyRecoveryCyclesMutable(state, cycles, exclusions = {}) {
  const excludedPersonnel = new Set(exclusions.personnelIds || []);
  const excludedFactions = new Set(exclusions.factionIds || []);
  let changed = false;
  for (const [id, person] of Object.entries(state.personnel.commanders)) {
    changed = recoverPerson(person, cycles, excludedPersonnel.has(id)) || changed;
  }
  for (const [id, person] of Object.entries(state.personnel.specialists)) {
    changed = recoverPerson(person, cycles, excludedPersonnel.has(id)) || changed;
  }
  for (const [id, faction] of Object.entries(state.factions)) {
    if (!faction.resident) continue;
    if (faction.recoveryCycles > 0 && !excludedFactions.has(id)) {
      faction.recoveryCycles = Math.max(0, faction.recoveryCycles - cycles);
      changed = true;
    }
    const before = faction.readiness;
    faction.readiness = clamp(faction.readiness + cycles * 7, 0, 100);
    faction.status = faction.recoveryCycles > 0 ? 'recovering' : 'ready';
    changed = faction.readiness !== before || changed;
  }
  return changed;
}

// Kept for existing callers that explicitly advance recovery outside an event.
export function advanceRecoveryCycles(state, cycles = 1) {
  assertDomainState(state);
  if (!Number.isInteger(cycles) || cycles < 1) throw new DomainValidationError('Recovery cycles must be a positive integer.', [issue('RECOVERY_CYCLES_INVALID', 'Expected one or more recovery cycles.', 'cycles')]);
  if (state.operations.pending) throw new DomainValidationError('Recovery cannot advance while a ground operation is pending.', [issue('OPERATION_PENDING', 'Resolve the pending operation first.', 'operations.pending')]);
  const next = deepClone(state);
  if (!applyRecoveryCyclesMutable(next, cycles)) return state;
  next.revision += 1;
  assertDomainState(next);
  return next;
}
