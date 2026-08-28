/* Shared fail-closed network boundary for offline browser evidence.

   `mf_offline` is the harness contract requested by Stage 8; the runtime itself
   currently reads `massfront_offline`. Set both before source executes, then
   abort every HTTP(S), WebSocket, or other request that is not loopback. Data,
   blob, and about URLs do not reach a network and remain available for normal
   browser/runtime behavior. */

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
  try {
    localStorage.setItem('mf_offline', '1');
    localStorage.setItem('massfront_offline', '1');
  } catch {}
  /* A worker can otherwise satisfy requests before Playwright's page route sees
     them. Offline evidence is not a PWA-install test, so keep this page outside
     the service-worker path and remove stale registrations for its origin. */
  try {
    const workers = navigator.serviceWorker;
    if (workers) {
      const refuse = () => Promise.reject(new Error('service workers disabled for offline evidence'));
      try { Object.defineProperty(workers, 'register', { configurable: true, value: refuse }); }
      catch { try { workers.register = refuse; } catch {} }
      try { workers.getRegistrations().then(items => Promise.all(items.map(item => item.unregister()))).catch(() => {}); }
      catch {}
    }
  } catch {}
}

export async function installOfflineNetworkIsolation(page) {
  if (!page || typeof page.route !== 'function' || typeof page.addInitScript !== 'function') {
    throw new Error('OFFLINE_NETWORK_ISOLATION_REQUIRES_PAGE');
  }
  const prior = installedPages.get(page);
  if (prior) return prior;

  const blockedRequests = [];
  const blockedWebSockets = [];
  const guard = {
    blockedRequests,
    blockedWebSockets,
    snapshot() {
      return {
        installed: true,
        offlineStorage: { mf_offline: '1', massfront_offline: '1' },
        blockedRequests: blockedRequests.map(item => ({ ...item })),
        blockedWebSockets: blockedWebSockets.map(item => ({ ...item }))
      };
    },
    assertNoExternalRequests(label = 'offline browser evidence') {
      const attempts = [...blockedRequests, ...blockedWebSockets];
      if (!attempts.length) return true;
      throw new Error(`OFFLINE_NETWORK_ATTEMPT: ${label} blocked ${attempts.length} non-loopback request(s): `
        + attempts.slice(0, 8).map(item => item.url).join(', '));
    }
  };
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

  if (typeof page.routeWebSocket === 'function') {
    await page.routeWebSocket('**/*', async socket => {
      const url = socket.url();
      if (isOfflineSafeUrl(url)) return socket.connectToServer();
      blockedWebSockets.push({ url: redactedUrl(url), resourceType: 'websocket' });
      return socket.close({ code: 1008, reason: 'MASSFRONT offline evidence' });
    });
  }

  await page.addInitScript(forceOfflineStorage);
  installedPages.set(page, guard);
  return guard;
}
