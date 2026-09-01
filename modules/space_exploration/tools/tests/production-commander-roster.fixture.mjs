import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const RUNTIME_FILES = [
  'src/game/commander.js',
  'src/factions.js',
  'src/audio.js',
  'src/tutorial.js',
  'src/story.js'
];

/* Host-entry tests must carry the base game's real roster bytes. Rebuilding
   those bytes from the classic-script source catches drift that a hand-written
   fixture with a self-consistent but non-production fingerprint would miss. */
export async function loadProductionCommanderRosterSnapshot() {
  const sandbox = {
    console,
    econTick() {},
    sfx() {},
    applyCrate() {},
    aiTick() {},
    metaGrant() {},
    renderOps() {},
    renderOpsBrief() {},
    performance: { now: () => 0 },
    fetch: (...args) => globalThis.fetch(...args),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: {
      getElementById: () => null,
      createElement: () => ({
        style: { removeProperty() {}, setProperty() {} },
        classList: { add() {}, remove() {} },
        appendChild() {},
        insertBefore() {},
        addEventListener() {},
        querySelector: () => null,
        setAttribute() {}
      }),
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const path of RUNTIME_FILES) {
    const source = await readFile(new URL(path, ROOT), 'utf8');
    vm.runInContext(source, context, { filename: path });
  }
  return JSON.parse(vm.runInContext('JSON.stringify(commanderRosterSnapshotV1())', context));
}
