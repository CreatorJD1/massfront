/* Frontier wreck salvage.
   Derelict contacts without a cataloged site resolve a one-time salvage
   manifest domain-side. Rewards never live in the runtime chart, the ledger
   is the existing extracted-deposit list (no save migration), and the wreck
   must be in the routed system. */
import assert from 'node:assert/strict';
import {
  SALVAGE_CATALOG,
  getContactSalvage,
  RESOURCE_KEYS,
  MISSION_CATALOG,
  SYSTEM_CATALOG
} from '../src/domain/catalog.js';
import {
  createInitialDomainState,
  validateDomainState,
  deserializeDomainState,
  serializeDomainState
} from '../src/domain/state_store.js';
import { recoverContactSalvage } from '../src/domain/progression.js';
import { SHOWCASE_SYSTEMS } from '../src/systems/showcase_systems.js';
import { DomainValidationError } from '../src/domain/errors.js';

{
  /* Catalog integrity: every salvage entry names a real derelict contact in a
     real system, pays only real resources, and every listed system actually
     carries that contact in the runtime chart. */
  for (const salvage of Object.values(SALVAGE_CATALOG)) {
    assert.equal(salvage.id, salvage.contactId, 'salvage ids follow the contact id');
    assert.ok(SYSTEM_CATALOG[salvage.systemId], `${salvage.id} names a real system`);
    const contact = SHOWCASE_SYSTEMS[salvage.systemId].contacts.find(contact => contact.id === salvage.contactId);
    assert.ok(contact, `${salvage.id} must be a contact of its own system`);
    assert.equal(contact.interaction, 'discovery', `${salvage.id} must be a discovery contact`);
    assert.ok(!contact.siteId, `${salvage.id} must not duplicate a cataloged site`);
    const keys = Object.keys(salvage.rewards);
    assert.ok(keys.length > 0, `${salvage.id} must pay something`);
    for (const key of keys) assert.ok(RESOURCE_KEYS.includes(key), `${salvage.id} pays a real resource`);
    assert.ok(Object.values(salvage.rewards).every(amount => amount > 0), `${salvage.id} pays positive amounts`);
    assert.ok(getContactSalvage(salvage.contactId) === salvage);
  }
  assert.equal(getContactSalvage('aelos_embassy_spindle'), null, 'stations carry no salvage');
}

function routedState(systemId) {
  const state = createInitialDomainState();
  state.route.systemId = systemId;
  state.world.systems[systemId].discovered = true;
  return state;
}

{
  /* Happy path: recovering pays exactly the manifest, marks the ledger, and
     keeps the state valid. */
  const state = routedState('orion_arc');
  const before = { ...state.resources };
  const result = recoverContactSalvage(state, 'orion_condemned_lasher');
  assert.equal(result.salvage.id, 'orion_condemned_lasher');
  assert.deepEqual(result.rewards, { credits: 900, components: 90 });
  assert.equal(result.state.resources.credits, before.credits + 900);
  assert.equal(result.state.resources.components, before.components + 90);
  assert.ok(result.state.discoveries.extractedDepositIds.includes('orion_condemned_lasher'));
  assert.deepEqual(validateDomainState(result.state).issues, [], 'post-salvage state must validate');
}

{
  /* One-time: the second pass is refused, and round-tripping through a save
     keeps the wreck stripped. */
  let state = routedState('veyra');
  state = recoverContactSalvage(state, 'veyra_cinder_barge').state;
  assert.throws(() => recoverContactSalvage(state, 'veyra_cinder_barge'), DomainValidationError);
  const restored = deserializeDomainState(serializeDomainState(state));
  assert.ok(restored.discoveries.extractedDepositIds.includes('veyra_cinder_barge'));
  assert.throws(() => recoverContactSalvage(restored, 'veyra_cinder_barge'), DomainValidationError);
}

{
  /* Guards: unknown contacts, wrong system, and garbage ids all fail loud. */
  const state = routedState('sombrero_i');
  assert.throws(() => recoverContactSalvage(state, 'aelos_embassy_spindle'), DomainValidationError);
  assert.throws(() => recoverContactSalvage(state, 'veyra_cinder_barge'), DomainValidationError);
  assert.throws(() => recoverContactSalvage(state, 'not_a_contact'), DomainValidationError);
}

{
  /* Old saves without any salvage ledger entries load unchanged and can still
     recover — the ledger is shared with deposits, so there is no migration. */
  const legacy = routedState('sombrero_i');
  const restored = deserializeDomainState(serializeDomainState(legacy));
  const result = recoverContactSalvage(restored, 'sombrero_tithe_wreck');
  assert.equal(result.state.resources.alloys, restored.resources.alloys + 260);
}

{
  /* Missions and the salvage table must not collide on ids with the chart. */
  const missionIds = new Set(Object.keys(MISSION_CATALOG));
  for (const salvageId of Object.keys(SALVAGE_CATALOG)) {
    assert.equal(missionIds.has(salvageId), false, `salvage id ${salvageId} must not collide with a mission`);
  }
}

console.log('contact-salvage: ok');
