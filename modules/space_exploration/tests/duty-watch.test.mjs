/* L1/L2 — the strategic clock and the consequence at the pressure cap.

   Before the duty watch, `advanceExpeditionCycles` had no idle entry point:
   construction (the REQUIRED CORE commission) and crew recovery only moved
   when the player spent a probe, burned fuel or fought a battle. A player
   with none of those — the exact 0/2 WORK stall seen on device — could not
   reach the domain at all. The watch is the idle entry point, and it must
   behave exactly like the other cycle sources: ledger-guarded (the same
   event id never advances twice), +1 cycle each, pressure +2/cycle, capped,
   and with a consequence at the cap so "wait" cannot become a free loop. */
import assert from 'node:assert/strict';
import {
  beginGroundOperation,
  getUgaGroundAreaOptions,
  DUTY_WATCH_INTEL_DECAY,
  DUTY_WATCH_MAX_CYCLES,
  SOLO_FRONT_PRESSURE_CAP,
  assertDomainState,
  createInitialDomainState,
  createShowcaseReadyDomainState,
  enqueueConstruction,
  getConstructionStatus,
  getDutyWatchQuote,
  holdDutyWatch
} from '../src/domain/index.js';

const fresh = createInitialDomainState();

/* The quote mirrors the refuel/probe quotes: plain data, no mutation. */
{
  const quote = getDutyWatchQuote(fresh);
  assert.deepEqual(quote, {
    available: true, cycles: DUTY_WATCH_MAX_CYCLES,
    maxCycles: DUTY_WATCH_MAX_CYCLES, pressurePerCycle: 2, reason: null
  });
  assert.equal(fresh.revision, 0, 'a quote must not create a save revision');
}

/* Pending operations must gate the watch exactly as they gate plotCourse. */
{
  // Compact is the always-open bottom map rung — these mechanics tests do not
  // care about battlefield size, and the standard map is ladder-locked on a
  // fresh fixture under the linear unlock chain.
  const pendingMapId = getUgaGroundAreaOptions('uga_pale_bloom').maps[0].id;
  const busy = beginGroundOperation(createShowcaseReadyDomainState(), { missionId: 'uga_pale_bloom', mapId: pendingMapId }).state;
  const quote = getDutyWatchQuote(busy);
  assert.equal(quote.available, false);
  assert.equal(quote.reason, 'OPERATION_PENDING');
  assert.throws(() => holdDutyWatch(busy), /pending ground operation/i);
}

/* The core advance: +2 cycles, construction work +2 on the one powered job,
   front pressure +4 (2/cycle), revision bumped, input untouched. */
{
  let state = enqueueConstruction(fresh, 'mission_ops');
  const job = state.ship.constructionQueue[0];
  assert.equal(job.workRequired, 2, 'mission_ops commission requires 2 work');
  assert.equal(job.workCompleted, 0);
  const cycleBefore = state.ship.expeditionCycle;

  const first = holdDutyWatch(state);
  assert.equal(first.advanced, true);
  assert.deepEqual(first.breach, []);
  assert.equal(first.state.ship.expeditionCycle, cycleBefore + DUTY_WATCH_MAX_CYCLES);
  assert.deepEqual(first.state.ship.constructionQueue, [], 'both cycles hit the single powered commission and complete it');
  assert.equal(first.completedJobs.length, 1);
  assert.equal(first.completedJobs[0].districtId, 'mission_ops');
  assert.equal(first.state.ship.districts.mission_ops.commissioned, true);
  assert.equal(first.state.world.systems.aelos.soloFront.pressure, 18 + 4);
  assert.equal(first.state.world.systems.veyra.soloFront.pressure, 36, 'undiscovered fronts do not gain pressure');
  assert.equal(first.state.world.systems.veyra.soloFront.lastDelta, 0);
  assert.equal(first.state.world.systems.karak.soloFront.pressure, 72, 'undiscovered fronts do not gain pressure');
  assert.equal(first.state.intelligence.bySystem.aelos, 0, 'no intel decay below the cap');
  assert.ok(first.state.revision > state.revision);
  assert.equal(state.ship.expeditionCycle, cycleBefore, 'holdDutyWatch must not mutate its input');
  assert.equal(state.ship.constructionQueue[0].workCompleted, 0, 'the input job is untouched');
  assertDomainState(first.state);

  /* Ledger idempotence is the property that makes a re-rendered UI safe:
     committing the same state twice through the same event id must not
     double-advance. A second watch from the *advanced* state is a new event
     id (cycle+revision changed) and must advance again — the clock keeps
     ticking; only the same event is suppressed. */
  const cycleAfterFirst = first.state.ship.expeditionCycle;
  const second = holdDutyWatch(first.state);
  assert.equal(second.advanced, true);
  assert.equal(second.state.ship.expeditionCycle, cycleAfterFirst + DUTY_WATCH_MAX_CYCLES);
  assert.equal(second.state.world.systems.aelos.soloFront.pressure, 18 + 8);
}

/* L2 consequence: any discovered front that ends a watch at the cap breaches —
   pressure clamps (never exceeds 100), one intel band decays, the breach is
   reported. A front that arrives this watch (99 + 4) breaches the same as one
   already sitting there: at 100 the front boils over, whichever watch got it
   there. Undiscovered fronts stay pinned without breaching. */
{
  const state = structuredClone(fresh);
  state.world.systems.veyra.discovered = true;
  state.world.systems.veyra.soloFront.pressure = SOLO_FRONT_PRESSURE_CAP;
  state.intelligence.bySystem.veyra = 3;
  state.world.systems.aelos.soloFront.pressure = SOLO_FRONT_PRESSURE_CAP - 1;
  state.intelligence.bySystem.aelos = 2;

  const watch = holdDutyWatch(state);
  assert.equal(watch.advanced, true);
  assert.deepEqual(watch.breach, ['aelos', 'veyra'], 'both discovered fronts end the watch at the cap');

  const veyraFront = watch.state.world.systems.veyra.soloFront;
  assert.equal(veyraFront.pressure, SOLO_FRONT_PRESSURE_CAP, 'breach clamps at the cap');
  assert.equal(veyraFront.lastCause, 'breach');
  assert.equal(watch.state.intelligence.bySystem.veyra, 3 - DUTY_WATCH_INTEL_DECAY, 'intel decays one band on breach');
  assert.equal(veyraFront.lastDelta, -DUTY_WATCH_INTEL_DECAY, 'lastDelta reports the decay, not the clamp');

  const aelosFront = watch.state.world.systems.aelos.soloFront;
  assert.equal(aelosFront.pressure, SOLO_FRONT_PRESSURE_CAP, 'crossing the cap clamps');
  assert.equal(aelosFront.lastCause, 'breach');
  assert.equal(watch.state.intelligence.bySystem.aelos, 2 - DUTY_WATCH_INTEL_DECAY);
  assertDomainState(watch.state);

  /* And once clamped, repeated watches keep everything pinned. */
  const again = holdDutyWatch(watch.state);
  assert.deepEqual(again.breach, ['aelos', 'veyra']);
  assert.equal(again.state.world.systems.veyra.soloFront.pressure, SOLO_FRONT_PRESSURE_CAP);
  assert.equal(again.state.intelligence.bySystem.veyra, 3 - 2 * DUTY_WATCH_INTEL_DECAY);
  assert.equal(again.state.world.systems.karak.soloFront.pressure, 72, 'undiscovered fronts stay pinned: no pressure gain, no breach');
}

/* The watch advances the clock when there is nothing else to do — no queue,
   no resources. This is the deadlock case: before this action, such a save
   could never reach advanceExpeditionCycles again. */
{
  const empty = structuredClone(fresh);
  const before = empty.ship.expeditionCycle;
  const watch = holdDutyWatch(empty);
  assert.equal(watch.advanced, true);
  assert.equal(watch.state.ship.expeditionCycle, before + DUTY_WATCH_MAX_CYCLES);
  assert.deepEqual(watch.completedJobs, []);
}

/* Power gating still applies: a paused job earns nothing from idle cycles. */
{
  let state = enqueueConstruction(structuredClone(fresh), 'mission_ops');
  const cycleBefore = state.ship.expeditionCycle;
  const status = getConstructionStatus(state);
  assert.equal(status.active, 1, 'fixture expects one powered slot');
  // Drain the power budget: every commissioned district draws its tier draw
  // with no generation above engineering T1, so flood the queue beyond
  // capacity and confirm the watch only advances the powered head.
  for (const id of ['research', 'fabricator', 'hangar', 'logistics']) {
    state = enqueueConstruction(state, id);
  }
  const flooded = getConstructionStatus(state);
  assert.ok(flooded.active < flooded.queue.length, 'fixture expects power-gated queue');
  const watch = holdDutyWatch(state);
  assert.equal(watch.state.ship.expeditionCycle, cycleBefore + DUTY_WATCH_MAX_CYCLES);
  const advanced = watch.state.ship.constructionQueue
    .filter(job => job.workCompleted > state.ship.constructionQueue.find(j => j.id === job.id).workCompleted);
  assert.ok(advanced.length <= flooded.active, 'no job advances past the powered slot count');
}

/* Suppression via an already-processed event id: hand-craft the ledger entry
   the watch would push and confirm the exact event is a no-op. */
{
  const state = structuredClone(fresh);
  const eventId = `watch:${state.ship.expeditionCycle}:${state.revision}`;
  state.ship.processedCycleEventIds.push(eventId);
  const watch = holdDutyWatch(state);
  assert.equal(watch.advanced, false);
  assert.equal(watch.state, state, 'a suppressed event returns the same state object, no clone');
  assert.deepEqual(watch.breach, []);
}
