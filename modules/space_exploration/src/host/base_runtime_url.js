/* A native content mount lives below Capacitor's same-origin file mapping,
   while the installed updater, audio and commander portraits stay at their
   original game root. Never infer that root by climbing a filesystem URL. */
export const NATIVE_EXPLORATION_MOUNT_KEY = 'massfront.exploration.mount.v1';
export const NATIVE_EXPLORATION_READY_KEY = 'massfront.exploration.mount.ready.v1';
const MOUNT_KEYS = ['baseUrl', 'generation', 'issuedAt', 'kind', 'moduleUrl', 'schema', 'token'];
const MOUNT_SUFFIX = '/modules/space_exploration/index.html';
const nativeLoaderResolvers = new WeakSet();

function canonicalUrl(value) {
  if (typeof value !== 'string') return null;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.href !== value
    || url.username || url.password || url.search || url.hash) return null;
  return url;
}

export function readNativeExplorationMount(options = {}) {
  try {
    const storage = options.sessionStorage || globalThis.sessionStorage;
    const location = options.location || globalThis.location;
    const now = options.now === undefined ? Date.now() : options.now;
    const current = new URL(location.href);
    const record = JSON.parse(storage.getItem(NATIVE_EXPLORATION_MOUNT_KEY) || 'null');
    if (!record || Array.isArray(record)
      || Object.keys(record).sort().join('|') !== MOUNT_KEYS.join('|')
      || record.schema !== 1 || record.kind !== 'MassfrontNativeExplorationMountV1'
      || typeof record.generation !== 'string' || typeof record.token !== 'string'
      || !/^[a-f0-9]{64}$/.test(record.generation) || !/^[a-f0-9]{32}$/.test(record.token)
      || !Number.isSafeInteger(record.issuedAt) || record.issuedAt < 0
      || !Number.isSafeInteger(now) || now < record.issuedAt) return null;
    const base = canonicalUrl(record.baseUrl), module = canonicalUrl(record.moduleUrl);
    if (!base || !module || base.origin !== current.origin || module.origin !== current.origin
      || !base.pathname.endsWith('/index.html') || base.pathname.startsWith('/_capacitor_file_')
      || !module.pathname.startsWith('/_capacitor_file_/') || !module.pathname.endsWith(MOUNT_SUFFIX)
      || current.pathname !== module.pathname
      || /%(?:2e|2f|5c)/i.test(module.pathname + base.pathname)) return null;
    return Object.freeze({ ...record });
  } catch (_) { return null; }
}

export function resolveBaseRuntimeUrl(relativeUrl, referenceUrl, options = {}) {
  const fallback = new URL(relativeUrl, referenceUrl);
  const mount = readNativeExplorationMount(options);
  if (!mount) return fallback;
  const module = new URL(mount.moduleUrl), reference = new URL(referenceUrl);
  const moduleRoot = module.pathname.slice(0, -'index.html'.length);
  const contentRoot = module.pathname.slice(0, -'modules/space_exploration/index.html'.length);
  if (reference.origin !== module.origin || !reference.pathname.startsWith(moduleRoot)
    || fallback.origin !== module.origin || !fallback.pathname.startsWith(contentRoot)
    || fallback.pathname.startsWith(moduleRoot)) return fallback;
  const assetPath = fallback.pathname.slice(contentRoot.length);
  // Only base assets are relocated; module imports, GLBs and their external
  // textures retain the immutable generation path and dependency closure.
  if (!assetPath.startsWith('assets/') || /%(?:2e|2f|5c)/i.test(assetPath)) return fallback;
  return new URL(assetPath + fallback.search + fallback.hash, new URL('./', mount.baseUrl));
}

export function resolveBaseRuntimeNavigation(url, options = {}) {
  const mount = readNativeExplorationMount(options);
  if (typeof url !== 'string' || !/^(?:\.\.\/)+index\.html(?:[?#].*)?$/.test(url)) return url;
  if (!mount) {
    const current = new URL((options.location || globalThis.location).href);
    if (current.pathname.startsWith('/_capacitor_file_/')) {
      /* Capacitor's packaged document is always https://localhost/index.html.
         A damaged session mount used to make the emergency return throw even
         though that unprivileged origin-root document was still available.
         Keep the fallback deliberately narrower than the mounted resolver: it
         may only leave a local Capacitor file route for localhost itself. */
      if (['https:', 'http:'].includes(current.protocol) && current.hostname === 'localhost'
        && !current.username && !current.password) {
        return new URL(`/${url.slice(url.indexOf('index.html'))}`, current.origin).href;
      }
      throw new Error('The installed-game return path is unavailable. Restart MASSFRONT to recover safely.');
    }
    return url;
  }
  // This is a routing record, not authorization. Expiring it overnight would
  // strand valid missions in DATA; profile tickets and mission nonces retain
  // their independent security lifetimes and validation.
  // Existing host callers pass ../../../index.html. That happens to clamp to
  // the origin root in ordinary installs, but would escape the mounted tree.
  return new URL(url.slice(url.indexOf('index.html')), new URL('./', mount.baseUrl)).href;
}

export function nativeExplorationLoaderUrl(value, options = {}) {
  const mount = readNativeExplorationMount(options);
  if (!mount || typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value), module = new URL(mount.moduleUrl), base = new URL('./', mount.baseUrl);
    const moduleRoot = module.pathname.slice(0, -'index.html'.length);
    if (url.origin !== module.origin || url.username || url.password
      || (!url.pathname.startsWith(moduleRoot) && !url.pathname.startsWith(base.pathname + 'assets/'))) return value;
    return url.pathname + url.search + url.hash;
  } catch (_) { return value; }
}

export function installNativeExplorationLoaderUrls(options = {}) {
  if (!readNativeExplorationMount(options)) return false;
  const manager = options.manager || globalThis.THREE?.DefaultLoadingManager;
  if (!manager || typeof manager.resolveURL !== 'function') return false;
  if (nativeLoaderResolvers.has(manager.resolveURL)) return true;
  const previous = manager.resolveURL;
  const resolve = function (url) {
    return nativeExplorationLoaderUrl(previous.call(this, url), options);
  };
  // Capacitor 8.5's XHR interceptor proxies absolute localhost URLs whereas
  // fetch has a local-origin exemption. Three r128 FileLoader uses XHR. Keep
  // its local URLs root-relative without changing global XHR or remote traffic.
  // Do not use setURLModifier here: previous resolveURL closes over that
  // modifier and calling it from the modifier would recurse.
  nativeLoaderResolvers.add(resolve);
  manager.resolveURL = resolve;
  return true;
}

export function acknowledgeMountedRuntimeReady(context, options = {}) {
  if (!context) return false;
  const current = readNativeExplorationMount(options);
  // A resolved promise from the previous document/generation cannot confirm
  // a newer pending activation, even when it reused the same module filename.
  if (!current || MOUNT_KEYS.some(key => current[key] !== context[key])) return false;
  try {
    const readyAt = options.now === undefined ? Date.now() : options.now;
    const storage = options.localStorage || globalThis.localStorage;
    storage.setItem(NATIVE_EXPLORATION_READY_KEY, JSON.stringify({
      schema: 1, generation: current.generation, token: current.token,
      moduleUrl: current.moduleUrl, readyAt
    }));
    return true;
  } catch (_) { return false; }
}
