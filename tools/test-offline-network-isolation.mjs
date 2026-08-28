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

let initScript = null;
let requestHandler = null;
let socketHandler = null;
let routeInstallCount = 0;
const page = {
  async addInitScript(fn) { initScript = fn; },
  async route(pattern, handler) { assert.equal(pattern, '**/*'); requestHandler = handler; routeInstallCount++; },
  async routeWebSocket(pattern, handler) { assert.equal(pattern, '**/*'); socketHandler = handler; }
};
const isolation = await installOfflineNetworkIsolation(page);
assert.equal(await installOfflineNetworkIsolation(page), isolation, 'page installation must be idempotent');
assert.equal(routeInstallCount, 1, 'idempotent install must not stack routes');

const storage = new Map();
globalThis.localStorage = { setItem: (key, value) => storage.set(key, value) };
initScript();
delete globalThis.localStorage;
assert.equal(storage.get('mf_offline'), '1');
assert.equal(storage.get('massfront_offline'), '1');

async function request(url) {
  const calls = [];
  await requestHandler({
    request: () => ({ url: () => url, method: () => 'GET', resourceType: () => 'document' }),
    fallback: async () => calls.push('fallback'),
    continue: async () => calls.push('continue'),
    abort: async reason => calls.push(`abort:${reason}`)
  });
  return calls;
}
assert.deepEqual(await request('http://127.0.0.1:8100/'), ['fallback']);
assert.deepEqual(await request('https://user:secret@example.com/path?q=token'), ['abort:blockedbyclient']);
assert.equal(isolation.blockedRequests[0].url, 'https://example.com/path');

let connected = 0;
let closed = null;
await socketHandler({ url: () => 'ws://localhost/live', connectToServer: () => { connected++; } });
await socketHandler({ url: () => 'wss://socket.example.com/live?token=secret', close: async value => { closed = value; } });
assert.equal(connected, 1);
assert.deepEqual(closed, { code: 1008, reason: 'MASSFRONT offline evidence' });
assert.equal(isolation.blockedWebSockets[0].url, 'wss://socket.example.com/live');
assert.throws(() => isolation.assertNoExternalRequests('fixture'), /OFFLINE_NETWORK_ATTEMPT/);

console.log('PASS offline network isolation (storage, loopback allowlist, HTTP abort, WebSocket refusal, redaction, idempotence)');
