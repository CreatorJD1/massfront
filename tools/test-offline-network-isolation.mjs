#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  installOfflineNetworkIsolation,
  isLoopbackHostname,
  isOfflineSafeUrl
} from './offline-network-isolation.mjs';

for (const hostname of ['localhost', 'qa.localhost', '127.0.0.1', '127.200.3.4', '::1', '[::1]']) {
  assert.equal(isLoopbackHostname(hostname), true, `expected loopback hostname: ${hostname}`);
}
for (const hostname of ['0.0.0.0', '126.255.255.255', '128.0.0.1', 'example.com', '127.0.0.1.example.com']) {
  assert.equal(isLoopbackHostname(hostname), false, `expected non-loopback hostname: ${hostname}`);
}
for (const url of ['http://127.0.0.1:8100/', 'https://localhost/', 'ws://127.9.8.7/live',
  'wss://[::1]/live', 'data:text/plain,ok', 'blob:http://127.0.0.1/id', 'about:blank']) {
  assert.equal(isOfflineSafeUrl(url), true, `expected offline-safe URL: ${url}`);
}
for (const url of ['https://example.com/', 'wss://api.example.com/live', 'http://0.0.0.0/',
  'ftp://127.0.0.1/file', 'not a url']) {
  assert.equal(isOfflineSafeUrl(url), false, `expected blocked URL: ${url}`);
}

const cleanBootstrap = {
  attempted: true, mf_offline: '1', massfront_offline: '1', errors: []
};
const cleanObserved = {
  storage: { mf_offline: '1', massfront_offline: '1', bootstrap: cleanBootstrap, error: null },
  workers: { supported: true, controller: null, registrations: [], error: null }
};

function makePage({ observed = cleanObserved, cdpFailure = null, closeHook = null } = {}) {
  let closed = false;
  const record = {
    initScript: null, requestHandler: null, socketHandler: null,
    routeInstallCount: 0, cdpCommands: [], detached: false
  };
  const page = {
    async addInitScript(fn) { record.initScript = fn; },
    async route(pattern, handler) {
      assert.equal(pattern, '**/*'); record.requestHandler = handler; record.routeInstallCount++;
    },
    async routeWebSocket(pattern, handler) {
      assert.equal(pattern, '**/*'); record.socketHandler = handler;
    },
    context() {
      return {
        async newCDPSession() {
          if (cdpFailure) throw new Error(cdpFailure);
          return {
            async send(method, params) { record.cdpCommands.push({ method, params }); },
            async detach() { record.detached = true; }
          };
        }
      };
    },
    async evaluate() { return structuredClone(observed); },
    isClosed() { return closed; },
    async close() { if (closeHook) await closeHook(record); closed = true; }
  };
  return { page, record };
}

{
  const fixture = makePage();
  delete fixture.page.routeWebSocket;
  await assert.rejects(
    installOfflineNetworkIsolation(fixture.page),
    /OFFLINE_NETWORK_ISOLATION_REQUIRES_PAGE/,
    'installation must fail closed when WebSocket routing is unavailable'
  );
}
{
  const fixture = makePage({ cdpFailure: 'CDP unavailable' });
  await assert.rejects(
    installOfflineNetworkIsolation(fixture.page),
    /OFFLINE_SERVICE_WORKER_BYPASS_REQUIRED/,
    'installation must fail closed when service-worker bypass cannot be configured'
  );
}

const fixture = makePage();
const isolation = await installOfflineNetworkIsolation(fixture.page);
assert.equal(await installOfflineNetworkIsolation(fixture.page), isolation, 'page installation must be idempotent');
assert.equal(fixture.record.routeInstallCount, 1, 'idempotent install must not stack routes');
assert.deepEqual(fixture.record.cdpCommands, [
  { method: 'Network.enable', params: undefined },
  { method: 'Network.setBypassServiceWorker', params: { bypass: true } }
]);
assert.equal(isolation.snapshot().offlineStorage.verified, false, 'unobserved storage must not be reported as verified');
assert.equal(isolation.snapshot().serviceWorkers.verified, false, 'unobserved workers must not be reported as verified');
assert.throws(() => isolation.assertNoExternalRequests('premature fixture'),
  /OFFLINE_NETWORK_FINALIZATION_REQUIRED/,
  'a clean counter snapshot must not pass before page state and shutdown are verified');

const storage = new Map();
globalThis.localStorage = {
  setItem: (key, value) => storage.set(key, value),
  getItem: key => storage.get(key) ?? null
};
globalThis.window = globalThis;
fixture.record.initScript();
delete globalThis.localStorage;
delete globalThis.window;
assert.equal(storage.get('mf_offline'), '1');
assert.equal(storage.get('massfront_offline'), '1');
assert.deepEqual(globalThis.__mfOfflineIsolationBootstrap, cleanBootstrap);
delete globalThis.__mfOfflineIsolationBootstrap;

async function request(record, url) {
  const calls = [];
  await record.requestHandler({
    request: () => ({ url: () => url, method: () => 'GET', resourceType: () => 'document' }),
    fallback: async () => calls.push('fallback'),
    continue: async () => calls.push('continue'),
    abort: async reason => calls.push(`abort:${reason}`)
  });
  return calls;
}
assert.deepEqual(await request(fixture.record, 'http://127.0.0.1:8100/'), ['fallback']);
assert.deepEqual(await request(fixture.record, 'https://user:secret@example.com/path?q=token'), ['abort:blockedbyclient']);
assert.equal(isolation.blockedRequests[0].url, 'https://example.com/path');

let connected = 0;
let closed = null;
await fixture.record.socketHandler({ url: () => 'ws://localhost/live', connectToServer: () => { connected++; } });
await fixture.record.socketHandler({ url: () => 'wss://socket.example.com/live?token=secret', close: async value => { closed = value; } });
assert.equal(connected, 1);
assert.deepEqual(closed, { code: 1008, reason: 'MASSFRONT offline evidence' });
assert.equal(isolation.blockedWebSockets[0].url, 'wss://socket.example.com/live');
assert.throws(() => isolation.assertNoExternalRequests('fixture'), /OFFLINE_NETWORK_ATTEMPT/);

{
  const badStorage = makePage({ observed: {
    /* Pre-existing correct-looking keys must not hide a failed init write. */
    storage: { mf_offline: '1', massfront_offline: '1', bootstrap: {
      attempted: true, mf_offline: null, massfront_offline: '1', errors: ['mf_offline: quota']
    }, error: null },
    workers: cleanObserved.workers
  } });
  const guard = await installOfflineNetworkIsolation(badStorage.page);
  await assert.rejects(guard.finalize('storage failure fixture'), /OFFLINE_STORAGE_UNVERIFIED/);
  assert.equal(guard.snapshot().offlineStorage.verified, false);
  assert.equal(guard.snapshot().pageClosed, true, 'failed verification must still close the page');
}
{
  const activeWorker = makePage({ observed: {
    storage: cleanObserved.storage,
    workers: {
      supported: true,
      controller: { scriptURL: 'http://127.0.0.1/sw.js', state: 'activated' },
      registrations: [{ scope: 'http://127.0.0.1/', active: { scriptURL: 'http://127.0.0.1/sw.js', state: 'activated' } }],
      error: null
    }
  } });
  const guard = await installOfflineNetworkIsolation(activeWorker.page);
  await assert.rejects(guard.finalize('service-worker fixture'), /OFFLINE_SERVICE_WORKER_ACTIVE/);
  assert.equal(guard.snapshot().serviceWorkers.verified, false);
}
{
  let lateFixture;
  lateFixture = makePage({ closeHook: async record => {
    await request(record, 'https://late.example.com/unload');
    await record.socketHandler({
      url: () => 'wss://late.example.com/unload', close: async () => {}
    });
  } });
  const guard = await installOfflineNetworkIsolation(lateFixture.page);
  await assert.rejects(guard.finalize('late request fixture'), /OFFLINE_NETWORK_ATTEMPT/,
    'a request attempted during page shutdown must fail finalization');
  assert.equal(guard.snapshot().blockedRequests.length, 1);
  assert.equal(guard.snapshot().blockedWebSockets.length, 1);
}
{
  const clean = makePage();
  const guard = await installOfflineNetworkIsolation(clean.page);
  const snapshot = await guard.finalize('clean fixture');
  assert.equal(snapshot.finalized, true);
  assert.equal(snapshot.pageClosed, true);
  assert.equal(snapshot.offlineStorage.verified, true);
  assert.equal(snapshot.serviceWorkers.bypassConfigured, true);
  assert.equal(snapshot.serviceWorkers.verified, true);
  assert.equal(clean.record.detached, true);
}

console.log('PASS offline network isolation (verified storage, CDP worker bypass, registration/controller gate, HTTP/WebSocket refusal, late-shutdown assertion, redaction, idempotence)');
