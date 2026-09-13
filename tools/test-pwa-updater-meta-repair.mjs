#!/usr/bin/env node
/* Exercise the service-worker recovery against real Chromium/IndexedDB. The
   stale-index case must preserve every payload record; an active updater lease
   must block the repair entirely. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repairedWorker = await readFile(resolve(ROOT, 'www/sw.js'), 'utf8');
const oldWorker = `'use strict';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));`;

async function readUpdaterRecords(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('massfront-updates', 1);
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = ['active', 'activeMeta', 'pending', 'pendingMeta', 'previousRef', 'operation'];
    const values = await new Promise((resolveTx, reject) => {
      const tx = db.transaction('bundles', 'readonly');
      const store = tx.objectStore('bundles');
      const requests = keys.map(key => store.get(key));
      tx.oncomplete = () => resolveTx(Object.fromEntries(keys.map((key, index) => [key, requests[index].result])));
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    db.close();
    return values;
  });
}

async function readWorkerStatus(page) {
  return page.evaluate(() => new Promise(resolve => {
    const timer = setTimeout(() => resolve({ repair: 'timeout' }), 3000);
    navigator.serviceWorker.addEventListener('message', function onMessage(event) {
      if (event.data?.type !== 'MASSFRONT_SW_STATUS') return;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      clearTimeout(timer); resolve(event.data);
    });
    navigator.serviceWorker.controller?.postMessage({ type: 'MASSFRONT_SW_STATUS' });
  }));
}

async function runCase(browser, liveOperation) {
  let nextWorker = false;
  const pageHtml = '<!doctype html><meta charset="utf-8"><title>repair test</title>';
  const server = createServer((request, response) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(nextWorker ? repairedWorker : oldWorker);
    } else if (path === '/assets/app.webmanifest') {
      response.setHeader('Content-Type', 'application/manifest+json'); response.end('{}');
    } else if (path === '/assets/data/manifest.json') {
      response.setHeader('Content-Type', 'application/json'); response.end('{"order":[]}');
    } else if (path === '/boot.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end('');
    } else {
      response.setHeader('Content-Type', 'text/html'); response.end(pageHtml);
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const context = await browser.newContext();
  let page = await context.newPage();
  try {
    await page.goto(base);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./sw.js?v=old', { scope: './', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async live => {
      const db = await new Promise((resolveDb, reject) => {
        const request = indexedDB.open('massfront-updates', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('bundles');
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolveTx, reject) => {
        const tx = db.transaction('bundles', 'readwrite');
        const store = tx.objectStore('bundles');
        const active = { version: '1.33.50', channel: 'stable', at: 500,
          order: ['./src/main.js'], files: { './src/main.js': 'window.__old=true;' } };
        store.put(active, 'active');
        store.put({ version: '1.33.49', channel: 'stable', at: 400 }, 'activeMeta');
        store.put({ version: '1.33.55', channel: 'stable', at: 600,
          order: ['./src/main.js'], files: { './src/main.js': 'window.__new=true;' } }, 'pending');
        store.put({ version: '1.33.55', channel: 'stable', at: 600 }, 'pendingMeta');
        store.put({ key: 'previousA', version: '1.33.48', channel: 'stable', at: 300 }, 'previousRef');
        store.put({ token: 'apply-test', kind: 'apply', at: Date.now() - (live ? 1000 : 600000) }, 'operation');
        tx.oncomplete = resolveTx; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, liveOperation);
    nextWorker = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register('./sw.js?v=shell2', { scope: './', updateViaCache: 'none' });
      await reg.update();
    });
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('./');
      return !!reg?.active?.scriptURL.includes('shell2');
    }, null, { timeout: 30000 });
    try { await page.reload(); } catch (error) {
      if (!/closed/i.test(String(error && error.message))) throw error;
    }
    if (page.isClosed()) { page = await context.newPage(); await page.goto(base); }
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('shell2'), null, { timeout: 30000 });
    await page.waitForTimeout(250);
    try { return { values: await readUpdaterRecords(page), status: await readWorkerStatus(page) }; }
    catch (error) {
      if (!/closed/i.test(String(error && error.message))) throw error;
      page = await context.newPage(); await page.goto(base);
      return { values: await readUpdaterRecords(page), status: await readWorkerStatus(page) };
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    server.closeAllConnections?.();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
try {
  const staleCase = await runCase(browser, false), stale = staleCase.values;
  if (stale.activeMeta !== undefined) throw new Error(`STALE_ACTIVE_META_NOT_REMOVED:${staleCase.status.repair}`);
  for (const key of ['active', 'pending', 'pendingMeta', 'previousRef', 'operation'])
    if (stale[key] === undefined) throw new Error(`RECOVERY_DELETED_${key.toUpperCase()}`);
  const liveCase = await runCase(browser, true), live = liveCase.values;
  if (!live.activeMeta || live.activeMeta.version !== '1.33.49') throw new Error('LIVE_OPERATION_DID_NOT_BLOCK_REPAIR');
  for (const key of ['active', 'pending', 'pendingMeta', 'previousRef', 'operation'])
    if (live[key] === undefined) throw new Error(`LIVE_GUARD_DELETED_${key.toUpperCase()}`);
  console.log(JSON.stringify({ status: 'PASS', staleMetaRemoved: true,
    pendingPreserved: stale.pending.version, rollbackPreserved: stale.previousRef.version,
    staleWorkerStatus: staleCase.status.repair, liveWorkerStatus: liveCase.status.repair,
    liveOperationBlocked: true }, null, 2));
} finally {
  await closePwBrowser(browser).catch(() => {});
}
