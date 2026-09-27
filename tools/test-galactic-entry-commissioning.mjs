/* AN ESTABLISHED CAREER MUST REACH GALACTIC COMMAND ALREADY COMMISSIONED.
 *
 * src/main.js decides what commissioning assignment rides the Galactic entry
 * ticket. For a long time that decision had exactly one accepting branch: a
 * new-career faction gate resolved to phase 'ready'. But career-faction-gate's
 * arm() DELETES that gate the moment a career has played anything, so every
 * career past its first match shipped {factionId:null,commanderId:null}
 * forever. Downstream that is not a cosmetic default - the module renders
 * "Hire your first commander" permanently and its HIRE COMMANDER button routes
 * to new-career-faction, whose openFromRoute() returns false when the gate is
 * not pending, so rejectMenuRoute() drops the player on the main menu. The
 * career becomes unable to commission a commander at all.
 *
 * This runs the real decision block out of src/main.js in a VM, so it tracks
 * the shipped source rather than a copy of it.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/* Optional path argument so this can be pointed at a mutated copy to prove the
   gate still fails when the behaviour it guards is removed. */
const source = readFileSync(process.argv[2] || root + 'src/main.js', 'utf8');

const START = 'const commissioning={factionId:null,commanderId:null};';
const END = 'const ticket={schemaVersion:2';
const from = source.indexOf(START);
const to = source.indexOf(END, from);
assert.ok(from >= 0 && to > from, 'could not locate the entry-ticket commissioning block in src/main.js');
const block = source.slice(from, to);

/* The roster authority the block validates against: Commander 1 per faction. */
const roster = {
  fingerprint: 'fnv1a32:0aadcd2d',
  commander1ByCampaignFaction: { nova: 'nova_kai', dominion: 'legion_vex', syndicate: 'syndicate_renn' },
  commanders: [
    { id: 'nova_kai', campaignFactionId: 'nova' },
    { id: 'legion_vex', campaignFactionId: 'dominion' },
    { id: 'syndicate_renn', campaignFactionId: 'syndicate' }
  ]
};
const passThrough = (factionId, commanderId) => ({
  armed: false, pending: false, phase: 'pass-through', canEnterSpaceCareer: true,
  factionId, starterCommanderId: commanderId
});
const resolved = (factionId, commanderId) => ({
  armed: true, pending: false, phase: 'ready', canEnterSpaceCareer: true,
  factionId, starterCommanderId: commanderId
});
function decide(META, gateState) {
  const context = { META, gateState, roster };
  vm.runInNewContext(`${block}; __out={commissioning,commissionedReady};`, context);
  /* Re-home the result: objects built inside the VM carry that realm's
     Object.prototype, which deepStrictEqual refuses even when every value
     matches. Spreading rebuilds them here so the comparison is about content. */
  return { commissioning: { ...context.__out.commissioning }, commissionedReady: context.__out.commissionedReady };
}

/* ---- 1. THE BUG: a played career must arrive commissioned ---- */
const played = decide({ matches: 12, setup: { pf: 'nova', pc: 'nova_kai' } }, passThrough('nova', 'nova_kai'));
assert.deepEqual(played.commissioning, { factionId: 'nova', commanderId: 'nova_kai' },
  'a career that has played matches must carry its issued Commander 1 on the entry ticket');
assert.equal(played.commissionedReady, true);

/* standardMatches and firstPlayed are the other two ways arm() calls a career started. */
for (const meta of [{ standardMatches: 3, setup: { pf: 'legion', pc: 'legion_vex' } },
                    { firstPlayed: 1730000000000, setup: { pf: 'syndicate', pc: 'syndicate_renn' } }]) {
  const faction = meta.setup.pf === 'legion' ? 'dominion' : meta.setup.pf;
  const out = decide(meta, passThrough(faction, roster.commander1ByCampaignFaction[faction]));
  assert.equal(out.commissionedReady, true, `a started career (${Object.keys(meta)[0]}) must commission`);
  assert.equal(out.commissioning.factionId, faction);
}

/* ---- 2. The boundary this code exists to hold: an UNPLAYED profile ----
   A fresh profile can still carry the historical Nova quick-pick, which was
   never a choice. It must stay uncommissioned and go through the gate. */
const fresh = decide({ matches: 0, standardMatches: 0, setup: { pf: 'nova', pc: 'nova_kai' } },
  passThrough('nova', 'nova_kai'));
assert.deepEqual(fresh.commissioning, { factionId: null, commanderId: null },
  'an unplayed profile must not have its default faction treated as a commissioning choice');
assert.equal(fresh.commissionedReady, false);

/* ---- 3. The resolved new-career gate still works ---- */
const gated = decide({ matches: 0 }, resolved('syndicate', 'syndicate_renn'));
assert.deepEqual(gated.commissioning, { factionId: 'syndicate', commanderId: 'syndicate_renn' });
assert.equal(gated.commissionedReady, true);

/* ---- 4. Roster authority is still enforced ---- */
assert.throws(() => decide({ matches: 0 }, resolved('nova', 'syndicate_renn')),
  /Commissioning authority mismatch/,
  'a resolved gate naming the wrong commander must still be refused');

/* A played career with incoherent legacy data stays uncommissioned rather than
   throwing — a broken record must not make Galactic entry unreachable. */
const legacy = decide({ matches: 40, setup: { pf: 'nova', pc: 'nova_kai' } }, passThrough('nova', 'legion_vex'));
assert.deepEqual(legacy.commissioning, { factionId: null, commanderId: null });
assert.equal(legacy.commissionedReady, false);

/* A pending gate must never be bypassed, however much the career has played. */
const pending = decide({ matches: 12, setup: { pf: 'nova', pc: 'nova_kai' } },
  { armed: true, pending: true, phase: 'faction-selection', canEnterSpaceCareer: false,
    factionId: 'nova', starterCommanderId: 'nova_kai' });
assert.deepEqual(pending.commissioning, { factionId: null, commanderId: null },
  'an unresolved faction gate must still block commissioning');

console.log('PASS galactic entry commissioning: played careers carry their issued Commander 1; unplayed profiles, pending gates and bad roster authority are still refused.');
