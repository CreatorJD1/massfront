/* Native mapping contracts and the actual document bootstrap with a controlled
   readiness promise. No claim of physical WebView/filesystem verification. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import {
  NATIVE_EXPLORATION_MOUNT_KEY, NATIVE_EXPLORATION_READY_KEY,
  readNativeExplorationMount, resolveBaseRuntimeUrl, resolveBaseRuntimeNavigation,
  acknowledgeMountedRuntimeReady, nativeExplorationLoaderUrl, installNativeExplorationLoaderUrls
} from '../modules/space_exploration/src/host/base_runtime_url.js';

if (!vm.SourceTextModule) {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
}
function storage() {
  const rows = new Map();
  return { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key), rows };
}
function fixture() {
  const record = {
    schema: 1, kind: 'MassfrontNativeExplorationMountV1', generation: 'a'.repeat(64), token: 'b'.repeat(32),
    baseUrl: 'https://localhost/index.html',
    moduleUrl: 'https://localhost/_capacitor_file_/data/user/0/com.creatorjd.massfront/files/galactic/' + 'a'.repeat(64) + '/modules/space_exploration/index.html',
    issuedAt: Date.now()
  };
  const options = { sessionStorage: storage(), localStorage: storage(), location: { href: record.moduleUrl + '?groundResult=opaque#target' }, now: record.issuedAt + 100 };
  const save = next => options.sessionStorage.setItem(NATIVE_EXPLORATION_MOUNT_KEY, JSON.stringify(next));
  save(record); return { record, options, save };
}
const checks = [];
async function test(name, run) { await run(); checks.push(name); }
await test('ordinary root and subpath asset URLs preserve existing behavior', () => {
  for (const prefix of ['https://game.example/', 'https://game.example/release/game/']) {
    const ref = prefix + 'modules/space_exploration/src/audio/space_audio.js';
    const options = { location: { href: prefix + 'modules/space_exploration/index.html' }, sessionStorage: storage() };
    assert.equal(resolveBaseRuntimeUrl('../../../../assets/audio/', ref, options).href, prefix + 'assets/audio/');
    assert.equal(resolveBaseRuntimeNavigation('../../../index.html?groundOperation=abc', options), '../../../index.html?groundOperation=abc');
  }
});
await test('valid same-origin context remaps base audio and portraits, not module GLBs', () => {
  const { record, options } = fixture(), dir = new URL('./', record.moduleUrl);
  assert.ok(Object.isFrozen(readNativeExplorationMount(options)));
  assert.equal(resolveBaseRuntimeUrl('../../../../assets/audio/', new URL('src/audio/space_audio.js', dir), options).href, 'https://localhost/assets/audio/');
  assert.equal(resolveBaseRuntimeUrl('../../../../assets/factions/commanders/nova_kai.jpg', new URL('src/ui/uga_command.js', dir), options).href, 'https://localhost/assets/factions/commanders/nova_kai.jpg');
  assert.equal(resolveBaseRuntimeUrl('../../assets/runtime/models/uga-sections/scene.gltf', new URL('src/ship/uga_blender_assets.js', dir), options).href, new URL('assets/runtime/models/uga-sections/scene.gltf', dir).href);
  assert.equal(resolveBaseRuntimeNavigation('../../../index.html?groundOperation=abc#launch', options), 'https://localhost/index.html?groundOperation=abc#launch');
  assert.equal(resolveBaseRuntimeNavigation('https://elsewhere.invalid/index.html', options), 'https://elsewhere.invalid/index.html');
});
await test('canonical base subpath is retained for mounted base assets and return routes', () => {
  const { record, options, save } = fixture(); record.baseUrl = 'https://localhost/game/index.html'; save(record);
  assert.equal(resolveBaseRuntimeNavigation('../../../index.html?galacticRoute=abc', options), 'https://localhost/game/index.html?galacticRoute=abc');
  assert.equal(resolveBaseRuntimeUrl('../../../../assets/audio/', new URL('src/audio/space_audio.js', record.moduleUrl), options).href, 'https://localhost/game/assets/audio/');
});
await test('foreign, malformed, future and wrong-path contexts fail closed', () => {
  const variants = [
    { schema: 2 }, { extra: true }, { generation: ['a'.repeat(64)] }, { token: 'B'.repeat(32) },
    { baseUrl: 'https://evil.invalid/index.html' }, { baseUrl: 'https://localhost/index.html?q=x' },
    { baseUrl: 'https://localhost/_capacitor_file_/data/index.html' },
    { moduleUrl: 'https://localhost/modules/space_exploration/index.html' },
    { moduleUrl: 'https://elsewhere.invalid/_capacitor_file_/x/modules/space_exploration/index.html' },
    { issuedAt: -1 }, { issuedAt: '123' }
  ];
  for (const patch of variants) {
    const { record, options, save } = fixture(); save({ ...record, ...patch });
    assert.equal(readNativeExplorationMount(options), null, JSON.stringify(patch));
  }
  for (const age of [-1]) {
    const { record, options } = fixture(); options.now = record.issuedAt + age;
    assert.equal(readNativeExplorationMount(options), null);
  }
  const { options } = fixture(); options.location.href = 'https://localhost/index.html';
  assert.equal(readNativeExplorationMount(options), null);
});
await test('overnight routing remains valid; a damaged localhost mount escapes to the packaged game root', () => {
  const { record, options } = fixture();
  options.now = record.issuedAt + 7 * 24 * 60 * 60 * 1000;
  const snapshot = readNativeExplorationMount(options);
  assert.ok(snapshot);
  assert.equal(resolveBaseRuntimeNavigation('../../../index.html?groundOperation=fresh', options), 'https://localhost/index.html?groundOperation=fresh');
  assert.equal(acknowledgeMountedRuntimeReady(snapshot, options), true);
  options.sessionStorage.removeItem(NATIVE_EXPLORATION_MOUNT_KEY);
  assert.equal(resolveBaseRuntimeNavigation('../../../index.html?groundOperation=fresh', options), 'https://localhost/index.html?groundOperation=fresh');
  options.location.href = 'https://game.example/_capacitor_file_/untrusted/modules/space_exploration/index.html';
  assert.throws(() => resolveBaseRuntimeNavigation('../../../index.html?groundOperation=fresh', options), /return path is unavailable/,
    'a file-mapped path on a foreign host must never inherit the packaged-root escape');
});
await test('ready acknowledgment has exact shape and never alters session mount/profile', () => {
  const { record, options } = fixture(); const before = options.sessionStorage.getItem(NATIVE_EXPLORATION_MOUNT_KEY);
  const snapshot = readNativeExplorationMount(options);
  options.localStorage.setItem('massfront_meta_default', 'unchanged');
  assert.equal(acknowledgeMountedRuntimeReady(snapshot, options), true);
  assert.deepEqual(JSON.parse(options.localStorage.getItem(NATIVE_EXPLORATION_READY_KEY)), {
    schema: 1, generation: record.generation, token: record.token, moduleUrl: record.moduleUrl, readyAt: options.now
  });
  assert.equal(options.sessionStorage.getItem(NATIVE_EXPLORATION_MOUNT_KEY), before);
  assert.equal(options.localStorage.getItem('massfront_meta_default'), 'unchanged');
});
await test('stale generation/token and revoked mount cannot acknowledge a replacement', () => {
  for (const patch of [{ generation: 'c'.repeat(64) }, { token: 'd'.repeat(32) }, { baseUrl: 'https://localhost/changed/index.html' }]) {
    const { record, options, save } = fixture(), snapshot = readNativeExplorationMount(options); save({ ...record, ...patch });
    assert.equal(acknowledgeMountedRuntimeReady(snapshot, options), false);
    assert.equal(options.localStorage.getItem(NATIVE_EXPLORATION_READY_KEY), null);
  }
  const { options } = fixture(), snapshot = readNativeExplorationMount(options);
  options.sessionStorage.removeItem(NATIVE_EXPLORATION_MOUNT_KEY);
  assert.equal(acknowledgeMountedRuntimeReady(snapshot, options), false);
  assert.equal(acknowledgeMountedRuntimeReady(null, options), false);
});
await test('loader URL conversion is mount-scoped and preserves nonlocal/data/blob/ordinary requests', () => {
  const { record, options } = fixture();
  const local = new URL('assets/runtime/ship.glb?v=1#mesh', record.moduleUrl).href;
  assert.equal(nativeExplorationLoaderUrl(local, options), new URL(local).pathname + '?v=1#mesh');
  assert.equal(nativeExplorationLoaderUrl('https://localhost/assets/audio/mus_ambient.ogg?v=2', options), '/assets/audio/mus_ambient.ogg?v=2');
  for (const value of ['data:application/octet-stream;base64,AAAA', 'blob:https://localhost/opaque', 'https://remote.invalid/model.glb', '/assets/local.glb', '../model.glb', 'https://localhost/api/private', 'https://localhost/_capacitor_file_/other/tree.bin']) {
    assert.equal(nativeExplorationLoaderUrl(value, options), value);
  }
  options.location.href = 'https://localhost/modules/space_exploration/index.html';
  assert.equal(nativeExplorationLoaderUrl(local, options), local);
});
await test('manager wrapper is idempotent, preserves existing resolver and never changes ordinary manager', () => {
  const { record, options } = fixture(); let calls = 0;
  const manager = { resolveURL(value) { calls++; return value === 'alias' ? new URL('assets/runtime/ship.glb', record.moduleUrl).href : value; } };
  const env = { ...options, manager };
  assert.equal(installNativeExplorationLoaderUrls(env), true); const first = manager.resolveURL;
  assert.equal(installNativeExplorationLoaderUrls(env), true); assert.equal(manager.resolveURL, first);
  assert.ok(manager.resolveURL('alias').startsWith('/_capacitor_file_/')); assert.equal(calls, 1);
  const ordinary = { resolveURL: value => value };
  assert.equal(installNativeExplorationLoaderUrls({ ...env, manager: ordinary, sessionStorage: storage() }), false);
  assert.equal(ordinary.resolveURL('alias'), 'alias');
});
await test('actual THREE FileLoader plus exact .74 native XHR interceptor uses local mapping after wrapper', async () => {
  const { record, options } = fixture();
  const bridge = await readFile(new URL('../node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(bridge).digest('hex'), '8ecc290bdd4f54605a6851e73023d4ba5ba0e56aa1d3eba75962242482b8fb4e', 'native bridge changed; review extraction against shipped .74 evidence');
  const prelude = bridge.slice(bridge.indexOf('const CAPACITOR_HTTP_INTERCEPTOR ='), bridge.indexOf('const initBridge ='));
  const openStart = bridge.indexOf('prototype.open = function (method, url) {') + 'prototype.open = '.length;
  const openEnd = bridge.indexOf('// XHR patch set request header', openStart);
  assert.ok(openStart > 30 && openEnd > openStart);
  const openSource = bridge.slice(openStart, openEnd).trim().replace(/;$/, '');
  const requests = [];
  class Xhr {
    addEventListener() {} setRequestHeader() {} overrideMimeType() {} send() {}
  }
  const context = vm.createContext({ console, URL, setTimeout, clearTimeout, XMLHttpRequest: Xhr,
    win: { Capacitor: { getServerUrl: () => 'https://localhost' }, CapacitorWebXMLHttpRequest: {
      open(method, url) { requests.push({ method, url }); }
    } } });
  vm.runInContext(`${prelude}\nXMLHttpRequest.prototype.open = (${openSource});`, context);
  const threeSource = await readFile(new URL('../modules/space_exploration/lib/three.min.js', import.meta.url), 'utf8');
  vm.runInContext(threeSource, context);
  const THREE = context.THREE;
  const mapped = new URL('assets/runtime/ship.glb', record.moduleUrl).href;
  new THREE.FileLoader().load(mapped + '?baseline=1');
  assert.match(requests.at(-1).url, /^https:\/\/localhost\/_capacitor_http_interceptor_\?u=/, 'unpatched native bridge must reproduce absolute-local proxy hazard');
  const manager = THREE.DefaultLoadingManager;
  manager.setURLModifier(url => url.replace('ship-alias.glb', 'ship.glb'));
  assert.equal(installNativeExplorationLoaderUrls({ ...options, manager }), true);
  new THREE.FileLoader().load(mapped.replace('ship.glb', 'ship-alias.glb') + '?wrapped=1');
  assert.equal(requests.at(-1).url, new URL(mapped).pathname + '?wrapped=1');
  new THREE.FileLoader().load('https://external.invalid/model.glb');
  assert.match(requests.at(-1).url, /^https:\/\/localhost\/_capacitor_http_interceptor_\?u=https%3A%2F%2Fexternal.invalid/);
  new THREE.FileLoader().load('https://localhost/assets/test.bin'); assert.equal(requests.at(-1).url, '/assets/test.bin');
  const gltf = await readFile(new URL('../modules/space_exploration/lib/GLTFLoader.js', import.meta.url), 'utf8');
  const draco = await readFile(new URL('../modules/space_exploration/lib/DRACOLoader.js', import.meta.url), 'utf8');
  vm.runInContext(gltf, context); vm.runInContext(draco, context);
  assert.equal(new THREE.GLTFLoader().manager, manager); assert.equal(new THREE.DRACOLoader().manager, manager);
  const runtime = await readFile(new URL('../modules/space_exploration/src/core/gltf_runtime_loader.js', import.meta.url), 'utf8');
  assert.match(runtime, /new mod\.KTX2Loader\(\)/); assert.match(runtime, /new THREE\.DRACOLoader\(\)/); assert.match(runtime, /new THREE\.GLTFLoader\(\)/);
  const ktx = await readFile(new URL('../modules/space_exploration/lib/ktx2/KTX2Loader.js', import.meta.url), 'utf8');
  assert.match(ktx, /super\( manager \)/); assert.match(ktx, /new FileLoader\( scope\.manager \)/);
});

const helperSource = await readFile(new URL('../modules/space_exploration/src/host/base_runtime_url.js', import.meta.url), 'utf8');
const bootstrapSource = await readFile(new URL('../modules/space_exploration/src/space_module.js', import.meta.url), 'utf8');
async function bootFixture() {
  const data = fixture();
  let resolveReady, rejectReady;
  const experience = { disposed: false, ready: new Promise((yes, no) => { resolveReady = yes; rejectReady = no; }), transmissions: {}, firstEntryIntro: {} };
  const frame = { dataset: {}, querySelector: () => null };
  const target = {
    location: { ...data.options.location, search: '', pathname: new URL(data.record.moduleUrl).pathname },
    sessionStorage: data.options.sessionStorage, localStorage: data.options.localStorage,
    document: {
      readyState: 'complete',
      getElementById: id => id === 'moduleFrame' ? frame : null,
      querySelector: () => null
    },
    console: { error() {}, warn() {} }, URL, URLSearchParams, setTimeout, clearTimeout,
    addEventListener() {}, __createExperience: () => experience
  };
  target.window = target;
  const context = vm.createContext(target);
  const stubs = {
    './startup_content.js?v=20260906-release5': '',
    './space_experience.js?v=20260908-uga81r1': 'export const createSpaceExperience=globalThis.__createExperience; export const SPACE_FIRST_ENTRY_CONTINUATION={};',
    './core/world_model_catalog.js': 'export const MASSFRONT_WORLD_MODEL_LIBRARY={};',
    './host/local_sandbox_host.js?v=20260825-host1': 'export class LocalSandboxHost{}; export class ExplorationHostError extends Error{}; export function createExplorationHostV1(){}',
    './host/massfront_solo_host.js?v=20260906-release5': 'export const MASSFRONT_GALACTIC_ENTRY_TICKET_KEY="entry"; export class MassfrontSoloHost{}; export function readMassfrontGalacticEntryTicket(){return null}; export function createMassfrontGalacticEntryTicket(){}; export function createMassfrontGalacticTacticalReportV1(){}; export function createMassfrontSoloHost(){}; export function validateMassfrontGalacticEntryTicket(){}'
  };
  const linked = new Map();
  const module = new vm.SourceTextModule(bootstrapSource, { context });
  await module.link(async specifier => {
    if (!linked.has(specifier)) {
      /* The helper is loaded from disk, so its cache-buster cannot hide a different
         module and is matched on path. Every stubbed dependency still matches its
         exact specifier, so a genuinely new import fails this gate for review. */
      const source = specifier.split('?')[0] === './host/base_runtime_url.js' ? helperSource : stubs[specifier];
      assert.notEqual(source, undefined, `unreviewed bootstrap dependency ${specifier}`);
      linked.set(specifier, new vm.SourceTextModule(source, { context }));
    }
    return linked.get(specifier);
  });
  await module.evaluate();
  return { ...data, experience, target, resolveReady, rejectReady };
}
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
await test('actual bootstrap acknowledges only a successfully resolved current experience', async () => {
  const data = await bootFixture();
  assert.equal(data.options.localStorage.getItem(NATIVE_EXPLORATION_READY_KEY), null);
  data.resolveReady(data.experience); await settle();
  assert.ok(data.options.localStorage.getItem(NATIVE_EXPLORATION_READY_KEY));
});
await test('actual bootstrap rejects failed, replaced, disposed and generation-stale readiness', async () => {
  for (const mode of ['failed', 'replaced', 'disposed', 'stale']) {
    const data = await bootFixture();
    if (mode === 'failed') data.rejectReady(new Error('asset decode failed'));
    else {
      if (mode === 'replaced') data.target.__MASSFRONT_SPACE__ = {};
      if (mode === 'disposed') data.experience.disposed = true;
      if (mode === 'stale') data.save({ ...data.record, generation: 'f'.repeat(64), token: 'e'.repeat(32) });
      data.resolveReady(data.experience);
    }
    await settle(); assert.equal(data.options.localStorage.getItem(NATIVE_EXPLORATION_READY_KEY), null, mode);
  }
});
console.log(JSON.stringify({ pass: true, cases: checks.length, checks, limitation: 'Controlled WebView URL/storage/ready fixtures; physical native filesystem interception not exercised.' }, null, 2));
