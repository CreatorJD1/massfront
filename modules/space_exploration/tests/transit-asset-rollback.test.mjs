/* Transit must not save a destination or spend fuel until authored scene assets
   are usable. The scene module requires Three/WebGL at import time, so execute
   these two small lifecycle functions with controlled browser/loader seams. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/space_experience.js', import.meta.url), 'utf8');
function extract(pattern, nextName) {
  const match = source.match(pattern);
  assert.ok(match, `${nextName} boundary must remain extractable`);
  return match[0].slice(0, match[0].lastIndexOf('\n\n  '));
}
const beginTransitSource = extract(/  function beginTransit\(systemId\) \{[\s\S]*?\n  \}\n\n  function loadSystem\(/, 'beginTransit');
const openSystemSource = extract(/  async function openSystem\(\) \{[\s\S]*?\n  \}\n\n  async function openUga\(/, 'openSystem');
const loadSystemSource = extract(/  function loadSystem\(systemId, \{ refresh = true \} = \{\}\) \{[\s\S]*?\n  \}\n\n  function savedTarget\(/, 'loadSystem');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function transitFixture() {
  const load = deferred();
  const calls = { commits: [], toasts: [], veil: [], scenes: [], hub: 0, refresh: 0, destroyed: 0, courseChecks: 0 };
  let timer = null;
  const context = {
    state: { route: { systemId: 'aelos', scene: 'galaxy' }, resources: { fuel: 12 } },
    transitTimer: 0, disposed: false, contextRecovering: false,
    engine: { currentSystem: { id: 'aelos' }, contextLost: false },
    galaxyMap: { flyToSystem: id => assert.equal(id, 'veyra') },
    SHOWCASE_LAYOUT: { systems: { aelos: { relays: ['veyra'] } } },
    SHOWCASE_SYSTEMS: { aelos: { name: 'Aelos' }, veyra: { name: 'Veyra' } },
    frame: {}, console: { warn: () => {} },
    plotCourse: (state, id) => {
      calls.courseChecks += 1;
      if (state.resources.fuel < 4) throw new Error('Insufficient fuel');
      return { ...state, route: { scene: 'system', systemId: id }, resources: { fuel: state.resources.fuel - 4 } };
    },
    commit: (next, type) => { calls.commits.push(type); context.state = next; },
    setTimeout: (callback, ms) => { assert.equal(ms, 850); timer = callback; return 7; },
    showToast: message => calls.toasts.push(message),
    setRenderVeil: (_frame, mode) => calls.veil.push(mode),
    loadSystem: (id, options) => {
      assert.equal(options?.refresh, false, 'transit loads may not re-save the origin snapshot');
      context.engine.currentSystem = { id };
      return load.promise;
    },
    destroyGalaxyMap: () => { calls.destroyed += 1; context.galaxyMap = null; },
    setScene: mode => calls.scenes.push(mode),
    refreshAll: () => { calls.refresh += 1; },
    openCampaignHub: async () => { calls.hub += 1; calls.scenes.push('uga'); calls.veil.push('ready'); return true; }
  };
  const beginTransit = vm.runInNewContext(`(${beginTransitSource})`, context);
  return { beginTransit, calls, context, load, runTimer: () => timer() };
}

{
  const fixture = transitFixture();
  fixture.beginTransit('veyra');
  assert.equal(fixture.calls.commits.length, 0, 'route/fuel must not commit while transit animation begins');
  assert.equal(fixture.context.state.route.systemId, 'aelos');
  assert.equal(fixture.context.state.resources.fuel, 12);
  const transit = fixture.runTimer();
  assert.equal(fixture.calls.commits.length, 0, 'route/fuel must remain at origin while assets load');
  fixture.load.resolve({ id: 'veyra' });
  await transit;
  assert.deepEqual(fixture.calls.commits, ['course:veyra']);
  assert.equal(fixture.calls.courseChecks, 2, 'the course must be revalidated against current state at settlement');
  assert.equal(fixture.context.state.route.systemId, 'veyra');
  assert.equal(fixture.context.state.resources.fuel, 8);
  assert.equal(fixture.calls.scenes.at(-1), 'system');
  assert.equal(fixture.calls.hub, 0);
}

{
  const fixture = transitFixture();
  fixture.beginTransit('veyra');
  const transit = fixture.runTimer();
  fixture.load.reject(new Error('PBR package unavailable'));
  await transit;
  assert.equal(fixture.calls.commits.length, 0, 'failed authored assets must not settle the course');
  assert.equal(fixture.context.state.route.systemId, 'aelos');
  assert.equal(fixture.context.state.resources.fuel, 12);
  assert.equal(fixture.calls.hub, 1, 'the origin strategic hub must remain usable');
  assert.equal(fixture.calls.veil.at(-1), 'ready', 'the failure veil must clear on strategic fallback');
  assert.match(fixture.calls.toasts.at(-1), /NO TRANSIT FUEL SPENT/);
}

{
  const fixture = transitFixture();
  fixture.beginTransit('veyra');
  const transit = fixture.runTimer();
  fixture.context.state.resources.fuel = 0;
  fixture.load.resolve({ id: 'veyra' });
  await transit;
  assert.equal(fixture.calls.commits.length, 0, 'a late fuel change must abort instead of committing a stale course');
  assert.equal(fixture.context.state.route.systemId, 'aelos');
  assert.equal(fixture.calls.hub, 1);
}

{
  let refreshes = 0;
  const context = {
    systemLoadStarted: false,
    physics: { ship: {}, stop: () => {} },
    engine: { loadSystemBodies: system => Promise.resolve(system), resetLoadProgress: () => {} },
    SHOWCASE_SYSTEMS: { aelos: { id: 'aelos' }, veyra: { id: 'veyra' } },
    galaxyMap: null, arkTarget: () => ({ id: 'nexus_vii' }), selectTarget: () => {},
    refreshAll: () => { refreshes += 1; }
  };
  const loadSystem = vm.runInNewContext(`(${loadSystemSource})`, context);
  await loadSystem('veyra', { refresh: false });
  assert.equal(refreshes, 0, 'staged destination load must not enqueue a precommit host save');
  await loadSystem('aelos');
  assert.equal(refreshes, 1, 'ordinary system loads retain their normal UI/snapshot refresh');
}

function systemFixture({ currentSystemId, loadResult, readyResult }) {
  const calls = { loads: [], hub: 0, scenes: [], veil: [], toasts: [] };
  const context = {
    state: { route: { systemId: 'aelos' } }, systemLoadStarted: true, disposed: false,
    engine: { currentSystem: { id: currentSystemId }, systemReady: readyResult },
    SHOWCASE_SYSTEMS: { aelos: { name: 'Aelos' } }, frame: {}, contextRecovering: false,
    galaxyMap: null, console: { warn: () => {} },
    setRenderVeil: (_frame, mode) => calls.veil.push(mode),
    loadSystem: async id => { calls.loads.push(id); context.engine.currentSystem = { id }; return loadResult; },
    openCampaignHub: async () => { calls.hub += 1; calls.veil.push('ready'); return true; },
    showToast: message => calls.toasts.push(message),
    selectTarget: () => {}, arkTarget: () => ({ id: 'nexus_vii' }),
    setScene: mode => calls.scenes.push(mode), destroyGalaxyMap: () => {}
  };
  return { openSystem: vm.runInNewContext(`(${openSystemSource})`, context), calls };
}

{
  const fixture = systemFixture({ currentSystemId: 'veyra', loadResult: { id: 'aelos' }, readyResult: Promise.resolve(null) });
  assert.equal(await fixture.openSystem(), true);
  assert.deepEqual(fixture.calls.loads, ['aelos'], 'after aborted transit, exiting UGA reloads the durable origin');
  assert.equal(fixture.calls.scenes.at(-1), 'system');
}

{
  const fixture = systemFixture({ currentSystemId: 'veyra', loadResult: null, readyResult: Promise.resolve(null) });
  assert.equal(await fixture.openSystem(), false);
  assert.deepEqual(fixture.calls.loads, ['aelos']);
  assert.equal(fixture.calls.hub, 1, 'if even origin assets fail, strategic controls remain available');
  assert.equal(fixture.calls.veil.at(-1), 'ready');
  assert.match(fixture.calls.toasts.at(-1), /RETRY FROM GALAXY/);
}

console.log('transit-asset-rollback.test.mjs PASS');
