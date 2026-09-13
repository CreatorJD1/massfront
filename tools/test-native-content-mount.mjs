/* Actual classic assetpack/content-mount sources, controlled IDB/native-FS
   doubles. This does not establish Android Java interception/device behavior. */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { readNativeExplorationMount, acknowledgeMountedRuntimeReady } from '../modules/space_exploration/src/host/base_runtime_url.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['src/assetpack.js', 'src/content-mount.js', 'modules/space_exploration/src/host/base_runtime_url.js'];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, await readFile(path, 'utf8')])));
const sourceBefore = Object.fromEntries(Object.entries(sources).map(([path, text]) => [path, sha(text)]));
const STATE = 'massfront.exploration.mount.state.v1', SESSION = 'massfront.exploration.mount.v1', READY = 'massfront.exploration.mount.ready.v1';
const PREFIX = 'massfront-content/galactic-exploration/';
const ROOT = '/data/user/0/com.creatorjd.massfront/files/';
const BASE_VERSION = '1.33.76';
function store() {
  const rows = new Map(), writes = [];
  return { rows, writes, fail: null, drop: null,
    getItem(key) { return rows.get(key) ?? null; },
    setItem(key, value) { if (this.fail === key) throw new Error('quota'); writes.push(key); if (this.drop !== key) rows.set(key, String(value)); },
    removeItem(key) { writes.push(key); rows.delete(key); } };
}
function idbDouble() {
  const databases = new Map();
  return { open(name, version) {
    const request = {};
    queueMicrotask(() => {
      if (!databases.has(name)) databases.set(name, { version: 0, stores: new Map() });
      const data = databases.get(name), upgrading = data.version < version;
      request.result = {
        objectStoreNames: { contains: key => data.stores.has(key) },
        createObjectStore: key => data.stores.set(key, new Map()), close() {},
        transaction(key) {
          const rows = data.stores.get(key);
          const tx = { objectStore() {
            const action = (fn, write = false) => {
              const result = {};
              queueMicrotask(() => {
                try { result.result = fn(); result.onsuccess?.(); if (write) queueMicrotask(() => tx.oncomplete?.()); }
                catch (error) { result.error = error; tx.error = error; result.onerror?.(); tx.onerror?.(); }
              });
              return result;
            };
            return { get: name => action(() => rows.get(name)), getAllKeys: () => action(() => [...rows.keys()]),
              put: (value, name) => action(() => rows.set(name, value), true), delete: name => action(() => rows.delete(name), true) };
          } };
          return tx;
        }
      };
      if (upgrading) { data.version = version; request.onupgradeneeded?.(); }
      request.onsuccess?.();
    });
    return request;
  } };
}
function release(tag = 'A', patch = {}) {
  const files = new Map([
    ['index.html', Buffer.from(`<!doctype html><html><head></head><body>${tag}</body></html>`)],
    ['src/space_module.js', Buffer.from(`export const release=${JSON.stringify(tag)};`)],
    ['assets/runtime/ship.bin', Buffer.alloc(600 * 1024 + 37, tag.charCodeAt(0))]
  ]);
  const version = patch.contentVersion || BASE_VERSION;
  const manifest = { schemaVersion: 2, kind: 'ExplorationContentManifestV1', contentVersion: version, compatibleGameRange: '=' + version,
    totalBytes: [...files.values()].reduce((sum, data) => sum + data.length, 0),
    files: [...files].map(([path, data]) => ({ path, bytes: data.length, hash: 'sha256-' + sha(data),
      chunks: [{ offset: 0, size: data.length, sha256: sha(data) }] })), ...patch };
  const text = JSON.stringify(manifest), generation = sha(text);
  const spec = { schema: 'MassfrontExplorationPackRemoteV2', version, manifestSha256: generation, manifestBytes: Buffer.byteLength(text) };
  return { files, manifest, text, generation, spec, nativeRoot: PREFIX + generation + '/modules/space_exploration/' };
}
function fixture(options = {}) {
  const localStorage = store(), sessionStorage = store(), nativeFiles = new Map(), writes = [], reads = [], events = [];
  const timers=new Map();let nextTimer=0;
  let nativeRootCalls = 0, operation = 0, interrupted = false;
  const controls = { corruptWrites: false, corruptReads: false, wrongOrigin: false, failOperation: 0, holdWrite: null };
  localStorage.rows.set('massfront_meta_default', '{"sentinel":"career preserved"}');
  localStorage.rows.set('massfront_profile', 'profile-preserved');
  const fs = {
    async getUri({ directory, path }) { assert.equal(directory, 'DATA'); return { uri: 'file://' + ROOT + path }; },
    async writeFile(options) { return write('writeFile', options); },
    async appendFile(options) { return write('appendFile', options); }
  };
  async function write(method, call) {
    assert.equal(call.directory, 'DATA'); assert.match(call.path, /^massfront-content\/galactic-exploration\/[a-f0-9]{64}\/modules\/space_exploration\//);
    assert.ok(!call.path.includes('..')); assert.ok(!call.encoding, 'binary bridge payload must not be interpreted as UTF8');
    const data = Buffer.from(call.data, 'base64'); assert.ok(data.length <= 256 * 1024);
    writes.push({ method, path: call.path, bytes: data.length });
    if (++operation === controls.failOperation && !interrupted) { interrupted = true; throw new Error('native-process-interruption'); }
    if (controls.holdWrite) await controls.holdWrite;
    const value = method === 'writeFile' ? Buffer.from(data) : Buffer.concat([nativeFiles.get(call.path) || Buffer.alloc(0), data]);
    if (controls.corruptWrites) value[0] ^= 255;
    nativeFiles.set(call.path, value);
    return { uri: 'file://' + ROOT + call.path };
  }
  const sandbox = {
    Blob, Response, Headers, ReadableStream, TextEncoder, TextDecoder, Uint8Array, Uint32Array,
    URL, URLSearchParams, Map, Set, Date, Math, Object, Array, String, Number, RegExp, Error, TypeError, Promise,
    console, crypto: webcrypto, indexedDB: idbDouble(), localStorage, sessionStorage, APP_VERSION: options.version || BASE_VERSION,
    location: { href: 'https://localhost/index.html?oldUpdate=1#intro', origin: 'https://localhost', protocol: 'https:' },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    document: { getElementById: () => null, createElement: () => ({}) },
    navigator: { onLine: true, locks: { async request(name, config, callback) { return callback({ name }); } },
      storage: { estimate: async () => ({ quota: 1024 ** 3, usage: 0 }), persisted: async () => true } },
    setTimeout: callback => {const id=++nextTimer;timers.set(id,callback);return id;},
    clearTimeout: id => timers.delete(id), addEventListener() {},
    dispatchEvent: event => events.push(event.detail), CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    netAllowed: () => true,
    Capacitor: {
      getPlatform: () => options.platform || 'android',
      convertFileSrc(uri) { return (controls.wrongOrigin ? 'https://evil.invalid' : 'https://localhost') + '/_capacitor_file_' + uri.slice('file://'.length); },
      Plugins: { Filesystem: fs, WebView: Object.fromEntries(['setServerBasePath', 'persistServerBasePath', 'setServerAssetPath'].map(name => [name, () => { nativeRootCalls++; throw new Error('FORBIDDEN WEBVIEW ROOT REPLACEMENT'); }])) }
    },
    fetch: async (url, config = {}) => {
      const parsed = new URL(url); assert.equal(parsed.origin, 'https://localhost', 'no external networking permitted in contract fixture');
      assert.equal(config.cache, 'no-store');
      const prefix = '/_capacitor_file_' + ROOT; assert.ok(parsed.pathname.startsWith(prefix));
      const path = parsed.pathname.slice(prefix.length); reads.push(path);
      if (!nativeFiles.has(path)) return new Response('', { status: 404 });
      const data = Buffer.from(nativeFiles.get(path)); if (controls.corruptReads) data[0] ^= 255;
      return new Response(new ReadableStream({ start(controller) {
        for (let offset = 0; offset < data.length; offset += 65536) controller.enqueue(new Uint8Array(data.subarray(offset, offset + 65536)));
        controller.close();
      } }), { status: 200 });
    }
  };
  if (options.noFs) delete sandbox.Capacitor.Plugins.Filesystem;
  sandbox.window = sandbox; vm.createContext(sandbox);
  vm.runInContext(sources['src/assetpack.js'], sandbox, { filename: 'src/assetpack.js' });
  vm.runInContext(sources['src/content-mount.js'], sandbox, { filename: 'src/content-mount.js' });
  const api = sandbox.MFNativeExplorationContent;
  async function seed(build) {
    await sandbox.packStorePut('meta', 'exploration:manifest:' + build.generation, build.text);
    for (const row of build.manifest.files) {
      const bytes = build.files.get(row.path);
      if (bytes) await sandbox.packStorePut('files', sandbox.packFileKey('galactic-exploration', { name: row.path, size: row.bytes, sha256: row.hash.replace(/^sha256-/, '') }), new Blob([bytes]));
    }
  }
  const invariants = () => {
    assert.equal(nativeRootCalls, 0);
    assert.equal(localStorage.getItem('massfront_meta_default'), '{"sentinel":"career preserved"}');
    assert.equal(localStorage.getItem('massfront_profile'), 'profile-preserved');
    assert.ok(localStorage.writes.every(key => [STATE, READY].includes(key)), 'only mount metadata may change localStorage');
    assert.ok(sessionStorage.writes.every(key => key === SESSION), 'only mount context may change sessionStorage');
  };
  return { sandbox, api, seed, localStorage, sessionStorage, nativeFiles, writes, reads, events, controls, invariants,
    runNextTimer:async()=>{const row=timers.entries().next().value;assert.ok(row,'expected a scheduled callback');timers.delete(row[0]);return row[1]();},
    pendingTimers:()=>timers.size,
    state: () => JSON.parse(localStorage.getItem(STATE) || 'null') };
}
const results = [], fixtures = [];
async function test(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); }
}
function use(options) { const value = fixture(options); fixtures.push(value); return value; }
async function prepared(tag = 'A') { const f = use(), build = release(tag); await f.seed(build); const result = await f.api.prepare(build.spec); assert.equal(result.ok, true, result.reason); return { f, build, result }; }
async function makeGood(f, result) {
  assert.equal(await f.api.beginLaunch(result.openUrl), true);
  const context = JSON.parse(f.sessionStorage.getItem(SESSION));
  const env = { sessionStorage: f.sessionStorage, localStorage: f.localStorage, location: { href: result.openUrl }, now: Date.now() };
  assert.ok(readNativeExplorationMount(env)); assert.equal(acknowledgeMountedRuntimeReady(context, env), true);
  return f.api.recover();
}

await test('null/unbound specs and unsupported native platforms fail without writes', async () => {
  const f = use();
  for (const spec of [null, {}, { schema: 'wrong', manifestSha256: 'a'.repeat(64) }]) assert.equal((await f.api.prepare(spec)).reason, 'unbound-content-manifest');
  for (const options of [{ platform: 'web' }, { platform: 'ios' }, { noFs: true }]) {
    const other = use(options); assert.equal((await other.api.prepare(release().spec)).reason, 'native-content-unavailable'); assert.equal(other.writes.length, 0);
  }
  assert.equal(f.writes.length, 0); assert.equal(f.localStorage.writes.length, 0);
});
await test('automatic startup defers on network policy while explicit retry remains available', async () => {
  const f=use();f.sandbox.__contentInstallCalls=[];f.sandbox.__MF_OTA_HAS_GALACTIC_DELIVERY=true;
  vm.runInContext(`mfInstallExplorationPack=async options=>{
    __contentInstallCalls.push(options);return {ok:false,reason:options.automatic?'save-data':'manual-test'};
  };mfContentScheduleStartup(0);`,f.sandbox);
  await f.runNextTimer();
  assert.equal(f.sandbox.__contentInstallCalls.length,1);
  assert.equal(f.sandbox.__contentInstallCalls[0].automatic,true);
  assert.equal(f.pendingTimers(),0,'a Save-Data refusal must not spin automatic retries');
  f.api.retry();await f.runNextTimer();
  assert.equal(f.sandbox.__contentInstallCalls.at(-1).automatic,false,
    'the player retry API must bypass only the automatic network-policy pause');
});
await test('bound raw manifest SHA and size are the staging authority', async () => {
  const f = use(), build = release(); await f.seed(build);
  await f.sandbox.packStorePut('meta', 'exploration:manifest:' + build.generation, build.text + ' ');
  assert.equal((await f.api.prepare(build.spec)).reason, 'content-manifest-integrity');
  assert.equal(f.writes.length, 0);
  await f.seed(build); assert.equal((await f.api.prepare({ ...build.spec, manifestBytes: build.spec.manifestBytes + 1 })).reason, 'content-manifest-integrity');
});
await test('descriptor and bound manifest must both target the exact running base version before staging', async () => {
  const f = use(), build = release(); await f.seed(build);
  for (const version of [undefined, '1.33.75', '1.33.77']) {
    assert.equal((await f.api.prepare({ ...build.spec, version })).reason, 'content-base-version');
  }
  for (const patch of [{ contentVersion: '1.33.75' }, { compatibleGameRange: '>=1.33.75' }, { compatibleGameRange: '=1.33.77' }]) {
    const incompatible = release('B', patch); await f.seed(incompatible);
    assert.equal((await f.api.prepare({ ...incompatible.spec, version: BASE_VERSION })).reason, 'content-base-version');
  }
  assert.equal(f.writes.length, 0); assert.equal(f.state(), null);
});
await test('manifest schema, entry and unsafe paths are rejected before native mutation', async () => {
  for (const patch of [{ schemaVersion: 1 }, { files: [] }, { files: [{ path: '../index.html', bytes: 1, hash: 'sha256-' + 'a'.repeat(64), chunks: [{ offset: 0, size: 1, sha256: 'a'.repeat(64) }] }], totalBytes: 1 }]) {
    const f = use(), build = release('A', patch); await f.seed(build);
    const result = await f.api.prepare(build.spec); assert.equal(result.ok, false); assert.equal(f.writes.length, 0);
  }
});
await test('immutable DATA hierarchy, <=256KiB binary writes and full readback match actual helpers', async () => {
  const { f, build, result } = await prepared();
  assert.ok(result.openUrl.endsWith('/' + build.nativeRoot + 'index.html'));
  assert.equal(new URL(result.openUrl).origin, 'https://localhost');
  for (const [path, bytes] of build.files) assert.deepEqual(f.nativeFiles.get(build.nativeRoot + path), bytes);
  assert.ok(f.writes.some(call => call.method === 'appendFile'));
  assert.ok(f.writes.every(call => call.bytes <= 256 * 1024));
  assert.equal(f.state().prepared.generation, build.generation); assert.equal(f.state().good, null);
  const count = f.writes.length; assert.equal((await f.api.prepare(build.spec)).ok, true); assert.equal(f.writes.length, count, 'verified native files must not rewrite');
});
await test('interrupted partial staging resumes completed files and safely rewrites partial file', async () => {
  const f = use(), build = release(); await f.seed(build); f.controls.failOperation = 4;
  const first = await f.api.prepare(build.spec); assert.equal(first.ok, false); assert.match(first.reason, /interruption/);
  assert.equal(f.state(), null, 'partial tree must not become launchable');
  const priorSmall = f.writes.filter(row => row.path.endsWith('index.html')).length;
  const next = await f.api.prepare(build.spec); assert.equal(next.ok, true, next.reason);
  assert.equal(f.writes.filter(row => row.path.endsWith('index.html')).length, priorSmall);
  assert.deepEqual(f.nativeFiles.get(build.nativeRoot + 'assets/runtime/ship.bin'), build.files.get('assets/runtime/ship.bin'));
});
await test('native corruption cannot activate; retry repairs from verified IDB body', async () => {
  const f = use(), build = release(); await f.seed(build); f.controls.corruptWrites = true;
  assert.equal((await f.api.prepare(build.spec)).reason, 'content-native-readback'); assert.equal(f.state(), null);
  f.controls.corruptWrites = false; const result = await f.api.prepare(build.spec); assert.equal(result.ok, true);
  f.nativeFiles.get(build.nativeRoot + 'src/space_module.js')[0] ^= 255;
  const count = f.writes.length; assert.equal((await f.api.prepare(build.spec)).ok, true); assert.ok(f.writes.length > count);
});
await test('wrong-origin native mapping and corrupt IDB body preserve existing good pointer', async () => {
  const { f, result } = await prepared(); await makeGood(f, result); const previous = f.localStorage.getItem(STATE);
  const next = release('B'); await f.seed(next); f.controls.wrongOrigin = true;
  assert.equal((await f.api.prepare(next.spec)).reason, 'content-native-origin'); assert.equal(f.localStorage.getItem(STATE), previous);
  f.controls.wrongOrigin = false;
  const row = next.manifest.files[0]; await f.sandbox.packStorePut('files', f.sandbox.packFileKey('galactic-exploration', { name: row.path, size: row.bytes, sha256: row.hash.slice(7) }), new Blob(['bad']));
  assert.equal((await f.api.prepare(next.spec)).reason, 'content-cache-integrity'); assert.equal(f.localStorage.getItem(STATE), previous);
});
await test('exact module helper ack promotes matching pending generation and keeps original origin', async () => {
  const { f, build, result } = await prepared();
  const good = await makeGood(f, result); assert.equal(good.good.generation, build.generation); assert.equal(good.pending, null); assert.equal(good.failed, null);
  const context = JSON.parse(f.sessionStorage.getItem(SESSION)); assert.equal(context.baseUrl, 'https://localhost/index.html');
  assert.equal(f.sandbox.location.href, 'https://localhost/index.html?oldUpdate=1#intro', 'adapter must not navigate/replace root by itself');
});
await test('missing readiness rolls back to last good directory; explicit retry can reattempt failed generation', async () => {
  const { f, result } = await prepared(); await makeGood(f, result);
  const next = release('B'); await f.seed(next); const newer = await f.api.prepare(next.spec); assert.equal(newer.ok, true);
  assert.equal(await f.api.beginLaunch(newer.openUrl), true); const failed = f.api.recover();
  assert.equal(failed.failed, next.generation); assert.equal(failed.good.moduleUrl, result.openUrl);
  const fallback = await f.api.prepare(next.spec); assert.equal(fallback.openUrl, result.openUrl); assert.equal(fallback.rollback, true);
  f.api.retry(); const retried = await f.api.prepare(next.spec); assert.equal(retried.openUrl, newer.openUrl); assert.equal(await f.api.beginLaunch(retried.openUrl), true);
});
await test('a new base cannot fall back, launch or return to an incompatible old successful generation after failed probation', async () => {
  const { f, build, result } = await prepared(); await makeGood(f, result);
  const oldContext = f.sessionStorage.getItem(SESSION), oldEntry = Buffer.from(f.nativeFiles.get(build.nativeRoot + 'index.html'));
  assert.equal(f.state().good.version, BASE_VERSION);
  // Keep persistent stores across the simulated base update, as a real old install does.
  f.sandbox.APP_VERSION = '1.33.77';
  const next = release('B', { contentVersion: '1.33.77' }); await f.seed(next);
  const newer = await f.api.prepare(next.spec); assert.equal(newer.ok, true, newer.reason);
  assert.equal(f.state().prepared.version, '1.33.77');
  assert.equal(await f.api.beginLaunch(newer.openUrl), true); assert.equal(f.state().pending.version, '1.33.77');
  const failed = f.api.recover(); assert.equal(failed.failed, next.generation); assert.equal(failed.good.version, BASE_VERSION);
  const fallback = await f.api.prepare(next.spec);
  assert.equal(fallback.ok, false); assert.equal(fallback.reason, 'content-rollback-integrity'); assert.equal(fallback.openUrl, undefined);
  assert.equal(await f.api.beginLaunch(result.openUrl), false);
  f.sessionStorage.setItem(SESSION, oldContext);
  assert.equal(f.sandbox.mfContentExplorationReturnUrl('./modules/space_exploration/index.html?groundResult=new_ticket'), null);
  assert.equal((await f.api.prepare(build.spec)).reason, 'content-base-version');
  assert.deepEqual(f.nativeFiles.get(build.nativeRoot + 'index.html'), oldEntry, 'incompatible content remains intact, never activated');
  assert.equal(f.sandbox.location.href, 'https://localhost/index.html?oldUpdate=1#intro');
  f.api.retry(); const retried = await f.api.prepare(next.spec); assert.equal(retried.openUrl, newer.openUrl);
  assert.equal(await f.api.beginLaunch(retried.openUrl), true, 'the compatible candidate remains explicitly retryable');
});
await test('stale token/generation ready marker never confirms replacement pending mount', async () => {
  const { f, result } = await prepared(); await makeGood(f, result);
  const oldAck = f.localStorage.getItem(READY), next = release('B'); await f.seed(next); const newer = await f.api.prepare(next.spec);
  assert.equal(await f.api.beginLaunch(newer.openUrl), true);
  f.localStorage.setItem(READY, oldAck); const recovered = f.api.recover();
  assert.equal(recovered.good.moduleUrl, result.openUrl); assert.equal(recovered.failed, next.generation);
});
await test('localStorage quota/drop and sessionStorage failure preserve old pointer and player saves', async () => {
  for (const failure of ['quota', 'drop']) {
    const { f, result } = await prepared(); await makeGood(f, result); const previous = f.localStorage.getItem(STATE), next = release('B'); await f.seed(next);
    f.localStorage[failure === 'quota' ? 'fail' : 'drop'] = STATE;
    assert.equal((await f.api.prepare(next.spec)).ok, false); assert.equal(f.localStorage.getItem(STATE), previous);
  }
  const { f, result } = await prepared(); const previous = f.localStorage.getItem(STATE); f.sessionStorage.fail = SESSION;
  assert.equal(await f.api.beginLaunch(result.openUrl), false); assert.equal(f.localStorage.getItem(STATE), previous);
});
await test('concurrent prepare is rejected without a second native writer', async () => {
  const f = use(), build = release(); await f.seed(build); let unblock;
  f.controls.holdWrite = new Promise(resolveWrite => { unblock = resolveWrite; });
  const running = f.api.prepare(build.spec); for (let n = 0; n < 20; n++) await Promise.resolve();
  assert.equal((await f.api.prepare(build.spec)).reason, 'busy'); f.controls.holdWrite = null; unblock(); assert.equal((await running).ok, true);
});
await test('unknown root-state schema cannot supply a launchable prepared/good candidate', async () => {
  const { f, result } = await prepared(); const state = f.state(); state.schema = 99; f.localStorage.setItem(STATE, JSON.stringify(state));
  assert.equal(await f.api.beginLaunch(result.openUrl), false, 'unknown future/corrupt root metadata must fail closed');
});
await test('tactical result returns to the verified mounted generation and ordinary packaged launch clears old routing', async () => {
  const { f, result } = await prepared(); await makeGood(f, result);
  const fallback='./modules/space_exploration/index.html?groundResult=opaque_0123456789abcdef';
  assert.equal(f.sandbox.mfContentExplorationReturnUrl(fallback),result.openUrl+'?groundResult=opaque_0123456789abcdef');
  assert.equal(f.sandbox.mfContentExplorationReturnUrl('https://foreign.invalid/modules/space_exploration/index.html'),null);
  const valid=f.sessionStorage.getItem(SESSION),overnight=JSON.parse(valid);overnight.issuedAt=Date.now()-86400001;
  f.sessionStorage.setItem(SESSION,JSON.stringify(overnight));
  assert.equal(f.sandbox.mfContentExplorationReturnUrl(fallback),result.openUrl+'?groundResult=opaque_0123456789abcdef');
  assert.ok(readNativeExplorationMount({sessionStorage:f.sessionStorage,location:{href:result.openUrl},now:Date.now()}), 'routing context is not the separately expiring mission authorization');
  const future={...overnight,issuedAt:Date.now()+5000};f.sessionStorage.setItem(SESSION,JSON.stringify(future));
  assert.equal(f.sandbox.mfContentExplorationReturnUrl(fallback),null);
  assert.equal(readNativeExplorationMount({sessionStorage:f.sessionStorage,location:{href:result.openUrl},now:Date.now()}),null);
  f.sessionStorage.setItem(SESSION,valid);
  assert.equal(await f.api.beginLaunch('https://foreign.invalid/index.html'),false);
  assert.equal(await f.api.beginLaunch('./modules/space_exploration/index.html'),true);
  assert.equal(f.sessionStorage.getItem(SESSION),null);assert.equal(f.sandbox.mfContentExplorationReturnUrl(fallback),fallback);
});
await test('rollback re-hashes the last-good native directory before returning its executable URL', async () => {
  const { f, build, result }=await prepared();await makeGood(f,result);
  const next=release('B');await f.seed(next);const newer=await f.api.prepare(next.spec);
  await f.api.beginLaunch(newer.openUrl);f.api.recover();
  f.nativeFiles.get(build.nativeRoot+'src/space_module.js')[0]^=255;
  assert.equal((await f.api.prepare(next.spec)).reason,'content-rollback-integrity');
});
await test('all cases preserve native root and player-owned keys', () => { for (const f of fixtures) f.invariants(); });

const sourceAfter = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await readFile(path))])));
if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter)) results.push({ name: 'source remained stable during contracts', pass: false });
const report = { pass: results.every(row => row.pass), capturedAt: new Date().toISOString(), sourceBefore, sourceAfter,
  verifierSha256: sha(await readFile(new URL(import.meta.url))), cases: results.length, results,
  limitations: 'VM actual source/helper contracts with in-memory IDB, filesystem and fetch doubles. No browser, remote service, physical native Java, device playback, or APK installation verified.' };
const output = resolve('tmp/native-content-mount-contract', report.capturedAt.replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true }); await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, cases: report.cases, passed: results.filter(row => row.pass).length, output,
  failed: results.filter(row => !row.pass) }, null, 2));
process.exitCode = report.pass ? 0 : 1;
