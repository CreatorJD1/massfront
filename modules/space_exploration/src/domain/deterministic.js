const PLAIN_OBJECT = Object.prototype;

function normalizeStable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Deterministic values must contain only finite numbers.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (typeof value === 'object' && Object.getPrototypeOf(value) === PLAIN_OBJECT) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) normalized[key] = normalizeStable(value[key]);
    }
    return normalized;
  }
  throw new TypeError('Deterministic values must be JSON-compatible plain data.');
}

export function stableStringify(value) {
  return JSON.stringify(normalizeStable(value));
}

// FNV-1a is intentionally small and non-cryptographic. These IDs are replay keys,
// not security tokens, and the same implementation must run in browsers and Node.
export function hash32(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deterministicId(prefix, value) {
  return `${prefix}_${hash32(value)}`;
}

export function deterministicUnit(seed, channel = 'default') {
  return parseInt(hash32(`${seed}:${channel}`), 16) / 0x100000000;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
