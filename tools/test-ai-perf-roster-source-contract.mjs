import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  BENCHMARK_SCENARIOS, COMPOSITION_PRESETS, UNIT_ARCHETYPES, UNIT_TYPE_CONTRACTS,
  generateDeterministicRoster, rosterTypeContracts, scenarioAuthorities
} from './perf-lab/scenario-manifests.mjs';

const simSource = fs.readFileSync(new URL('../src/game/sim.js', import.meta.url), 'utf8');
const start = simSource.indexOf('const TYPES=['), end = simSource.indexOf('\n];', start);
assert.ok(start >= 0 && end > start, 'could not extract runtime TYPES');
const context = vm.createContext({});
vm.runInContext(`${simSource.slice(start, end + 3)};globalThis.runtimeTypes=TYPES;`, context);
const runtimeTypes = context.runtimeTypes;

for (const contract of Object.values(UNIT_TYPE_CONTRACTS)) {
  const actual = runtimeTypes[contract.index];
  assert.ok(actual, `missing TYPES[${contract.index}]`);
  assert.equal(actual.name, contract.name, `stale name at TYPES[${contract.index}]`);
  assert.equal(!!actual.air, contract.air, `stale air role at TYPES[${contract.index}]`);
  assert.equal(!!actual.naval, contract.naval, `stale naval role at TYPES[${contract.index}]`);
}
assert.equal('SUBMARINE' in UNIT_ARCHETYPES, false, 'retired semantic SUBMARINE alias returned');
assert.equal('CARRIER' in UNIT_ARCHETYPES, false, 'retired semantic CARRIER alias returned');
assert.deepEqual(COMPOSITION_PRESETS.AIR_CAVALRY.map(entry => entry.type), [5, 17, 25]);
assert.ok(COMPOSITION_PRESETS.AIR_CAVALRY.every(entry => runtimeTypes[entry.type].air), 'air cavalry contains a ground chassis');

let generated = 0;
for (const scenario of Object.values(BENCHMARK_SCENARIOS)) {
  for (const count of [100, 250, 500]) {
    const rosters = scenarioAuthorities(scenario).map((spec, index) => ({
      roster: generateDeterministicRoster(spec, count, scenario.mapSeed + index * 1013)
    }));
    assert.ok(rosters.every(entry => entry.roster.length === count), `${scenario.id} did not admit exact ${count}-body rosters`);
    for (const contract of rosterTypeContracts(rosters)) {
      const actual = runtimeTypes[contract.index];
      assert.equal(actual.name, contract.name);
      assert.equal(!!actual.air, contract.air);
      assert.equal(!!actual.naval, contract.naval);
    }
    for (let index = 0; index < scenarioAuthorities(scenario).length; index++) {
      const spec = scenarioAuthorities(scenario)[index], body = rosters[index].roster.slice(1);
      if (spec.composition === 'AIR_CAVALRY') assert.ok(body.every(unit => runtimeTypes[unit.type].air));
      if (spec.composition === 'SWARM_INFESTATION') assert.ok(body.every(unit => runtimeTypes[unit.type].brood));
    }
    generated += rosters.reduce((sum, entry) => sum + entry.roster.length, 0);
  }
}

console.log(JSON.stringify({ status: 'PASS', contract: 'source-matched-perf-rosters', runtimeTypes: runtimeTypes.length, generated }, null, 2));
