/* Shared fail-closed network boundary for offline browser evidence.

   `mf_offline` is the harness contract requested by Stage 8; the runtime itself
   currently reads `massfront_offline`. Set both before source executes, then
   abort every HTTP(S), WebSocket, or other request that is not loopback. Data,
   blob, and about URLs do not reach a network and remain available for normal
   browser/runtime behavior. Evidence callers must finish with guard.finalize():
   it verifies page state, closes the page, then checks attempts made during
   shutdown before returning a truthfully verified snapshot. */

const installedPages = new WeakMap();
const LOCAL_PROTOCOLS = new Set(['about:', 'blob:', 'data:']);
const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

export function isLoopbackHostname(value) {
  const hostname = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true;
  const octets = hostname.split('.');
  return octets.length === 4 && octets.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    && Number(octets[0]) === 127;
}

export function isOfflineSafeUrl(value) {
  let parsed;
  try { parsed = new URL(String(value)); } catch { return false; }
  if (LOCAL_PROTOCOLS.has(parsed.protocol)) return true;
  return NETWORK_PROTOCOLS.has(parsed.protocol) && isLoopbackHostname(parsed.hostname);
}

function redactedUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch { return String(value).slice(0, 300); }
}

function forceOfflineStorage() {
  const result = { attempted: true, mf_offline: null, massfront_offline: null, errors: [] };
  for (const key of ['mf_offline', 'massfront_offline']) {
    try { localStorage.setItem(key, '1'); result[key] = localStorage.getItem(key); }
    catch (error) { result.errors.push(`${key}: ${error && error.message || error}`); }
  }
  try { window.__mfOfflineIsolationBootstrap = result; } catch {}
  /* Registration is disabled in page script as defense in depth. Chromium's
     CDP service-worker bypass is the pre-navigation boundary; finalization
     separately proves that this origin has no controller or registrations. */
  try {
    const workers = navigator.serviceWorker;
    if (workers) {
      const refuse = () => Promise.reject(new Error('service workers disabled for offline evidence'));
      try { Object.defineProperty(workers, 'register', { configurable: true, value: refuse }); }
      catch { try { workers.register = refuse; } catch {} }
    }
  } catch {}
}

export async function installOfflineNetworkIsolation(page) {
  if (!page || typeof page.route !== 'function' || typeof page.routeWebSocket !== 'function'
    || typeof page.addInitScript !== 'function' || typeof page.evaluate !== 'function'
    || typeof page.close !== 'function' || typeof page.isClosed !== 'function'
    || typeof page.context !== 'function') {
    throw new Error('OFFLINE_NETWORK_ISOLATION_REQUIRES_PAGE');
  }
  const prior = installedPages.get(page);
  if (prior) return prior;

  const blockedRequests = [];
  const blockedWebSockets = [];
  const state = {
    finalized: false,
    pageClosed: false,
    finalLabel: null,
    finalError: null,
    offlineStorage: {
      verified: false,
      mf_offline: null,
      massfront_offline: null,
      bootstrap: null,
      error: null
    },
    serviceWorkers: {
      bypassConfigured: false,
      verified: false,
      supported: null,
      controller: null,
      registrations: null,
      error: null
    }
  };
  let cdp = null;
  const guard = {
    blockedRequests,
    blockedWebSockets,
    get finalized() { return state.finalized; },
    snapshot() {
      return {
        installed: true,
        finalized: state.finalized,
        pageClosed: state.pageClosed,
        finalLabel: state.finalLabel,
        finalError: state.finalError,
        offlineStorage: { ...state.offlineStorage },
        serviceWorkers: {
          ...state.serviceWorkers,
          controller: state.serviceWorkers.controller ? { ...state.serviceWorkers.controller } : null,
          registrations: Array.isArray(state.serviceWorkers.registrations)
            ? state.serviceWorkers.registrations.map(item => ({ ...item })) : state.serviceWorkers.registrations
        },
        blockedRequests: blockedRequests.map(item => ({ ...item })),
        blockedWebSockets: blockedWebSockets.map(item => ({ ...item }))
      };
    },
    async verifyPageState(label = 'offline browser evidence') {
      if (page.isClosed()) {
        state.pageClosed = true;
        state.offlineStorage.error = 'page closed before offline state verification';
        state.serviceWorkers.error = 'page closed before service-worker verification';
        throw new Error(`OFFLINE_PAGE_STATE_UNVERIFIED: ${label}: page is already closed`);
      }
      let observed;
      try {
        observed = await page.evaluate(async () => {
          const storage = { mf_offline: null, massfront_offline: null, bootstrap: null, error: null };
          try {
            storage.mf_offline = localStorage.getItem('mf_offline');
            storage.massfront_offline = localStorage.getItem('massfront_offline');
            storage.bootstrap = window.__mfOfflineIsolationBootstrap || null;
          } catch (error) { storage.error = String(error && error.message || error); }
          const workers = { supported: false, controller: null, registrations: [], error: null };
          try {
            workers.supported = !!navigator.serviceWorker;
            if (workers.supported) {
              const workerInfo = worker => worker ? {
                scriptURL: String(worker.scriptURL || ''), state: String(worker.state || '')
              } : null;
              workers.controller = workerInfo(navigator.serviceWorker.controller);
              const registrations = await Promise.race([
                navigator.serviceWorker.getRegistrations(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('service-worker query timed out')), 5000))
              ]);
              workers.registrations = registrations.map(registration => ({
                scope: String(registration.scope || ''),
                active: workerInfo(registration.active),
                waiting: workerInfo(registration.waiting),
                installing: workerInfo(registration.installing)
              }));
            }
          } catch (error) { workers.error = String(error && error.message || error); }
          return { storage, workers };
        });
      } catch (error) {
        const message = String(error && error.message || error);
        state.offlineStorage.error = message;
        state.serviceWorkers.error = message;
        throw new Error(`OFFLINE_PAGE_STATE_UNVERIFIED: ${label}: ${message}`);
      }
      state.offlineStorage.mf_offline = observed?.storage?.mf_offline ?? null;
      state.offlineStorage.massfront_offline = observed?.storage?.massfront_offline ?? null;
      state.offlineStorage.bootstrap = observed?.storage?.bootstrap ?? null;
      state.offlineStorage.error = observed?.storage?.error || null;
      const bootstrap = state.offlineStorage.bootstrap;
      state.offlineStorage.verified = !state.offlineStorage.error
        && state.offlineStorage.mf_offline === '1' && state.offlineStorage.massfront_offline === '1'
        && bootstrap?.attempted === true && bootstrap.mf_offline === '1'
        && bootstrap.massfront_offline === '1' && Array.isArray(bootstrap.errors)
        && bootstrap.errors.length === 0;
      state.serviceWorkers.supported = observed?.workers?.supported === true;
      state.serviceWorkers.controller = observed?.workers?.controller || null;
      state.serviceWorkers.registrations = Array.isArray(observed?.workers?.registrations)
        ? observed.workers.registrations.map(item => ({ ...item })) : null;
      state.serviceWorkers.error = observed?.workers?.error || null;
      state.serviceWorkers.verified = !state.serviceWorkers.error
        && !state.serviceWorkers.controller && Array.isArray(state.serviceWorkers.registrations)
        && state.serviceWorkers.registrations.length === 0;
      if (!state.offlineStorage.verified) {
        throw new Error(`OFFLINE_STORAGE_UNVERIFIED: ${label}: mf_offline=${String(state.offlineStorage.mf_offline)} `
          + `massfront_offline=${String(state.offlineStorage.massfront_offline)} `
          + `bootstrapErrors=${Array.isArray(bootstrap?.errors) ? bootstrap.errors.length : 'unreadable'} `
          + `error=${state.offlineStorage.error || 'none'}`);
      }
      if (!state.serviceWorkers.verified) {
        throw new Error(`OFFLINE_SERVICE_WORKER_ACTIVE: ${label}: controller=${!!state.serviceWorkers.controller} `
          + `registrations=${Array.isArray(state.serviceWorkers.registrations) ? state.serviceWorkers.registrations.length : 'unreadable'} `
          + `error=${state.serviceWorkers.error || 'none'}`);
      }
      return guard.snapshot();
    },
    assertNoExternalRequests(label = 'offline browser evidence') {
      const attempts = [...blockedRequests, ...blockedWebSockets];
      if (attempts.length) {
        throw new Error(`OFFLINE_NETWORK_ATTEMPT: ${label} blocked ${attempts.length} non-loopback request(s): `
          + attempts.slice(0, 8).map(item => item.url).join(', '));
      }
      state.pageClosed = page.isClosed();
      if (!state.pageClosed || !state.offlineStorage.verified || !state.serviceWorkers.verified) {
        throw new Error(`OFFLINE_NETWORK_FINALIZATION_REQUIRED: ${label}: `
          + `pageClosed=${state.pageClosed} storageVerified=${state.offlineStorage.verified} `
          + `serviceWorkersVerified=${state.serviceWorkers.verified}`);
      }
      return true;
    },
    async finalize(label = 'offline browser evidence') {
      if (state.finalized) {
        if (state.finalError) throw new Error(state.finalError);
        return guard.snapshot();
      }
      state.finalLabel = label;
      const failures = [];
      try { await guard.verifyPageState(label); }
      catch (error) { failures.push(String(error && error.message || error)); }
      try { if (!page.isClosed()) await page.close(); }
      catch (error) { failures.push(`OFFLINE_PAGE_CLOSE_FAILED: ${error && error.message || error}`); }
      state.pageClosed = page.isClosed();
      if (!state.pageClosed) failures.push('OFFLINE_PAGE_CLOSE_FAILED: page remained open');
      try { guard.assertNoExternalRequests(label); }
      catch (error) { failures.push(String(error && error.message || error)); }
      try { await cdp?.detach(); } catch {}
      state.finalized = true;
      if (failures.length) {
        state.finalError = `OFFLINE_NETWORK_FINALIZATION_FAILED: ${failures.join(' | ')}`;
        throw new Error(state.finalError);
      }
      return guard.snapshot();
    }
  };
  const context = page.context();
  if (!context || typeof context.newCDPSession !== 'function') {
    throw new Error('OFFLINE_SERVICE_WORKER_BYPASS_REQUIRED: Chromium CDP session unavailable');
  }
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    state.serviceWorkers.bypassConfigured = true;
  } catch (error) {
    try { await cdp?.detach(); } catch {}
    throw new Error(`OFFLINE_SERVICE_WORKER_BYPASS_REQUIRED: ${error && error.message || error}`);
  }
  /* Install interception before the init script and, critically, before the
     caller's first navigation. `fallback` preserves any local fixture routes
     another harness installs; external requests never reach those handlers. */
  await page.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (isOfflineSafeUrl(url)) {
      if (typeof route.fallback === 'function') return route.fallback();
      return route.continue();
    }
    blockedRequests.push({
      url: redactedUrl(url),
      method: request.method(),
      resourceType: request.resourceType()
    });
    return route.abort('blockedbyclient');
  });

  /* Do not silently weaken this on an older Playwright. page.route() cannot
     prove WebSocket isolation, so installation itself fails unless the
     browser API can refuse non-loopback sockets. */
  await page.routeWebSocket('**/*', async socket => {
    const url = socket.url();
    if (isOfflineSafeUrl(url)) return socket.connectToServer();
    blockedWebSockets.push({ url: redactedUrl(url), resourceType: 'websocket' });
    return socket.close({ code: 1008, reason: 'MASSFRONT offline evidence' });
  });

  await page.addInitScript(forceOfflineStorage);
  installedPages.set(page, guard);
  return guard;
}
