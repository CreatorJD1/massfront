import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const startMarker = "mfBindTap($('startBtn'),async()=>{";
const start = source.indexOf(startMarker);
const end = source.indexOf("  mfBindTap($('warBack')", start);
assert.ok(start >= 0 && end > start, 'START Galactic handler must remain source-addressable');
const handlerSource = source.slice(start, end).trimEnd();

function harness(openExploration) {
  let handler = null;
  const calls = { audio: 0, sfx: 0, exploration: [], legacy: 0 };
  const context = {
    Promise,
    mfExplorationLaunching: false,
    __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
    __MF_OTA_HAS_GALACTIC_DELIVERY: false,
    $: id => ({ id }),
    mfBindTap: (_element, callback) => { handler = callback; },
    initAudio: () => { calls.audio++; },
    sfx: () => { calls.sfx++; },
    openLegacyWarRoom: () => { calls.legacy++; },
    mfOpenExploration: (...args) => {
      calls.exploration.push(args);
      return openExploration(context, ...args);
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(handlerSource, context, { filename: 'src/main.js#startGalacticEntry' });
  assert.equal(typeof handler, 'function');
  return { context, calls, handler };
}

let releaseLaunch;
const active = harness(async context => {
  context.mfExplorationLaunching = true;
  const result = await new Promise(resolve => { releaseLaunch = resolve; });
  context.mfExplorationLaunching = false;
  return result;
});
const firstTap = active.handler();
const duplicateTap = active.handler();
assert.equal(active.calls.exploration.length, 1, 'double tap must create only one Galactic launch');
assert.deepEqual(JSON.parse(JSON.stringify(active.calls.exploration[0])), [
  'campaign_hub',
  { explicitRetry: true, launchButtonId: 'startBtn' }
]);
assert.equal(active.calls.legacy, 0, 'duplicate tap must not open the legacy War Room');
releaseLaunch(true);
await Promise.all([firstTap, duplicateTap]);
assert.equal(active.calls.legacy, 0);
assert.equal(active.calls.audio, 1);
assert.equal(active.calls.sfx, 1);

const failed = harness(async context => {
  context.mfExplorationLaunching = true;
  await Promise.resolve();
  context.mfExplorationLaunching = false;
  return false;
});
await failed.handler();
assert.equal(failed.calls.exploration.length, 1);
assert.equal(failed.calls.legacy, 1, 'a genuine completed launch failure must retain the local War Room fallback');

console.log('START Galactic entry race guard: PASS');
