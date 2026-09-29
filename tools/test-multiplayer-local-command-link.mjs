import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/game/commander.js', import.meta.url), 'utf8');
const helper = source.match(/function commanderPresentingIdentity\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(helper, 'local command-link identity helper exists');
assert.match(source, /const identity=o\.commanderId\?commanderIdentity\(o\.commanderId\):commanderPresentingIdentity\(\)/,
  'unattributed gameplay cues use the local presenter');

function resolve({ network = false, hero = 4, id = 'nova_kai' } = {}) {
  const context = {
    window: { __MF_NETWORK_SETUP__: network ? { schema: 2 } : null },
    mfLocalCommander: () => hero,
    commanderIdForUnit: () => id,
    commanderIdentity: key => key === 'horde_sovereign' ? null : { id: key },
    playerCommanderIdentity: () => ({ id: 'nova_kai' }),
  };
  vm.createContext(context);
  return vm.runInContext(`${helper}\ncommanderPresentingIdentity()`, context);
}

assert.equal(resolve().id, 'nova_kai', 'offline presentation keeps player commander');
assert.equal(resolve({ network: true, id: 'legion_vex' }).id, 'legion_vex', 'remote human sees own playable commander');
assert.equal(resolve({ network: true, id: 'horde_sovereign' }), null, 'AI-only Horde seat cannot show Nova Kai');
assert.equal(resolve({ network: true, hero: -1 }), null, 'unspawned remote seat cannot borrow team-0 portrait');
console.log('Multiplayer local command-link identity: PASS');
