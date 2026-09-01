import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createMemoryStorage } from '../modules/space_exploration/src/domain/state_store.js';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const start = mainSource.indexOf('(function mfWireExploration(){');
const closing = '\n  })();';
const end = mainSource.indexOf(closing, start);
assert.ok(start >= 0 && end > start, 'Galactic entry bridge must remain source-addressable');
const bridgeSource = mainSource.slice(start, end + closing.length);

const roster = await loadProductionCommanderRosterSnapshot();

async function issueTicket(gateState) {
  const sessionStorage = createMemoryStorage();
  const location = { href: '/index.html' };
  const context = {
    console,
    Date,
    JSON,
    Promise,
    fetch: async () => ({ ok: true }),
    META: { settings: { experimentalExploration: true } },
    PROFILES: { active: 'p1' },
    commanderRosterSnapshotV1: () => roster,
    sessionStorage,
    location,
    initAudio() {},
    sfx() {},
    toast() {},
    mfOpenExploration: null
  };
  context.window = context;
  context.window.MFNewCareerFactionGate = {
    state: () => gateState,
    // This permission answers whether the workflow may enter space; it must
    // never be treated as proof that faction commissioning is complete.
    canEnterSpaceCareer: () => gateState?.canEnterSpaceCareer !== false
  };
  vm.createContext(context);
  vm.runInContext(bridgeSource, context, { filename: 'src/main.js#mfWireExploration' });
  assert.equal(await context.mfOpenExploration('system'), true);
  assert.equal(location.href, './modules/space_exploration/index.html');
  return JSON.parse(sessionStorage.getItem('massfront.galactic.entry.v1'));
}

const eligible = await issueTicket({
  armed: false,
  pending: false,
  phase: 'eligible',
  canEnterSpaceCareer: true,
  factionId: null,
  starterCommanderId: null
});
assert.equal(eligible.introRequired, true, 'eligible/null careers must receive the world introduction');
assert.deepEqual(eligible.commissioning, { factionId: null, commanderId: null });

const ready = await issueTicket({
  armed: true,
  pending: false,
  phase: 'ready',
  canEnterSpaceCareer: true,
  factionId: 'nova',
  starterCommanderId: roster.commander1ByCampaignFaction.nova
});
assert.equal(ready.introRequired, false, 'canonically commissioned careers must not replay the new-career introduction');
assert.deepEqual(ready.commissioning, {
  factionId: 'nova',
  commanderId: roster.commander1ByCampaignFaction.nova
});

assert.doesNotMatch(bridgeSource, /careerReady|introRequired:entryView==='system'&&!gate\.canEnterSpaceCareer/,
  'entry permission must stay separate from completed commissioning');

console.log('Galactic entry new-career introduction ticket: PASS');
