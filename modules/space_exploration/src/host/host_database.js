/* --------------------------------------------------------------------------
   MASSFRONT GALACTIC EXPLORATION — ISOLATED HOST DATABASE

   The optional exploration module owns this storage. Production MASSFRONT is
   intentionally not imported here. IndexedDB provides an atomic, exactly-once
   result ledger; the small Storage adapter is a standalone/webview fallback.
   -------------------------------------------------------------------------- */

export const EXPLORATION_HOST_DATABASE_NAME = 'massfront.exploration.host.v1';
export const EXPLORATION_HOST_DATABASE_VERSION = 1;

const REQUEST_STORE = 'operationRequests';
const RESULT_STORE = 'resultLedger';
const FALLBACK_PREFIX = 'massfront.exploration.host.v1';

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed.')), { once: true });
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed.')), { once: true });
  });
}

function storageKey(kind, value, prefix = FALLBACK_PREFIX) {
  return `${prefix}.${kind}.${encodeURIComponent(String(value))}`;
}

function parseStored(storage, key) {
  const serialized = storage.getItem(key);
  if (serialized === null) return null;
  return JSON.parse(serialized);
}

export class IndexedDbHostDatabase {
  constructor(indexedDbFactory, { name = EXPLORATION_HOST_DATABASE_NAME } = {}) {
    if (!indexedDbFactory || typeof indexedDbFactory.open !== 'function') throw new TypeError('IndexedDbHostDatabase requires an IndexedDB factory.');
    this.kind = 'indexeddb';
    this.indexedDbFactory = indexedDbFactory;
    this.name = name;
    this.openPromise = null;
  }

  open() {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      const request = this.indexedDbFactory.open(this.name, EXPLORATION_HOST_DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(REQUEST_STORE)) database.createObjectStore(REQUEST_STORE, { keyPath: 'nonce' });
        if (!database.objectStoreNames.contains(RESULT_STORE)) database.createObjectStore(RESULT_STORE, { keyPath: 'ledgerKey' });
      }, { once: true });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('Could not open exploration IndexedDB.')), { once: true });
      request.addEventListener('blocked', () => reject(new Error('Exploration IndexedDB upgrade is blocked.')), { once: true });
    });
    return this.openPromise;
  }

  async putRequest(record) {
    const database = await this.open();
    const transaction = database.transaction([REQUEST_STORE], 'readwrite');
    const done = transactionPromise(transaction);
    transaction.objectStore(REQUEST_STORE).put(record);
    await done;
    return record;
  }

  async getRequest(nonce) {
    const database = await this.open();
    const transaction = database.transaction([REQUEST_STORE], 'readonly');
    const done = transactionPromise(transaction);
    const record = await requestPromise(transaction.objectStore(REQUEST_STORE).get(nonce));
    await done;
    return record || null;
  }

  async getReceipt(ledgerKey) {
    const database = await this.open();
    const transaction = database.transaction([RESULT_STORE], 'readonly');
    const done = transactionPromise(transaction);
    const receipt = await requestPromise(transaction.objectStore(RESULT_STORE).get(ledgerKey));
    await done;
    return receipt || null;
  }

  async consumeOnce({ nonce, ledgerKey, accept }) {
    if (typeof accept !== 'function') throw new TypeError('consumeOnce requires a synchronous accept callback.');
    const database = await this.open();
    const transaction = database.transaction([REQUEST_STORE, RESULT_STORE], 'readwrite');
    const done = transactionPromise(transaction);
    const results = transaction.objectStore(RESULT_STORE);
    const existing = await requestPromise(results.get(ledgerKey));
    if (existing) {
      await done;
      return { status: 'duplicate', receipt: existing };
    }
    const record = await requestPromise(transaction.objectStore(REQUEST_STORE).get(nonce));
    if (!record) {
      transaction.abort();
      try { await done; } catch (_) { /* expected abort */ }
      return { status: 'missing', receipt: null };
    }
    let receipt;
    try {
      receipt = accept(record);
    } catch (error) {
      transaction.abort();
      try { await done; } catch (_) { /* preserve validation error */ }
      throw error;
    }
    results.add(receipt);
    await done;
    return { status: 'accepted', receipt };
  }

  close() {
    if (!this.openPromise) return;
    this.openPromise.then(database => database.close()).catch(() => {});
    this.openPromise = null;
  }
}

export class StorageHostDatabase {
  constructor(storage, { prefix = FALLBACK_PREFIX } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('StorageHostDatabase requires a Storage-compatible object.');
    this.kind = 'localstorage-fallback';
    this.storage = storage;
    this.prefix = prefix;
    this.queue = Promise.resolve();
  }

  async putRequest(record) {
    this.storage.setItem(storageKey('request', record.nonce, this.prefix), JSON.stringify(record));
    return record;
  }

  async getRequest(nonce) {
    return parseStored(this.storage, storageKey('request', nonce, this.prefix));
  }

  async getReceipt(ledgerKey) {
    return parseStored(this.storage, storageKey('result', ledgerKey, this.prefix));
  }

  consumeOnce({ nonce, ledgerKey, accept }) {
    const execute = async () => {
      const existing = await this.getReceipt(ledgerKey);
      if (existing) return { status: 'duplicate', receipt: existing };
      const record = await this.getRequest(nonce);
      if (!record) return { status: 'missing', receipt: null };
      const receipt = accept(record);
      this.storage.setItem(storageKey('result', ledgerKey, this.prefix), JSON.stringify(receipt));
      return { status: 'accepted', receipt };
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  close() {}
}

/**
 * Deterministic IndexedDB substitute used by module-local tests. Its queued
 * read/write section mirrors the serialization guarantee of an IDB transaction.
 */
export class FakeIndexedDbHostDatabase {
  constructor({ requests = [], receipts = [] } = {}) {
    this.kind = 'fake-indexeddb';
    this.requests = new Map(requests.map(record => [record.nonce, structuredClone(record)]));
    this.receipts = new Map(receipts.map(receipt => [receipt.ledgerKey, structuredClone(receipt)]));
    this.queue = Promise.resolve();
  }

  async putRequest(record) {
    this.requests.set(record.nonce, structuredClone(record));
    return structuredClone(record);
  }

  async getRequest(nonce) {
    const record = this.requests.get(nonce);
    return record ? structuredClone(record) : null;
  }

  async getReceipt(ledgerKey) {
    const receipt = this.receipts.get(ledgerKey);
    return receipt ? structuredClone(receipt) : null;
  }

  consumeOnce({ nonce, ledgerKey, accept }) {
    const execute = async () => {
      const existing = this.receipts.get(ledgerKey);
      if (existing) return { status: 'duplicate', receipt: structuredClone(existing) };
      const record = this.requests.get(nonce);
      if (!record) return { status: 'missing', receipt: null };
      const receipt = accept(structuredClone(record));
      this.receipts.set(ledgerKey, structuredClone(receipt));
      return { status: 'accepted', receipt: structuredClone(receipt) };
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  close() {}
}

export class FailoverHostDatabase {
  constructor(primary, fallback) {
    if (!fallback) throw new TypeError('FailoverHostDatabase requires a fallback database.');
    this.kind = primary ? 'indexeddb-with-storage-fallback' : fallback.kind;
    this.primary = primary || null;
    this.fallback = fallback;
    this.primaryError = null;
  }

  async runPrimary(method, args) {
    if (!this.primary) return null;
    try {
      return await this.primary[method](...args);
    } catch (error) {
      this.primaryError = error;
      try { this.primary.close(); } catch (_) {}
      this.primary = null;
      return null;
    }
  }

  async putRequest(record) {
    await this.fallback.putRequest(record);
    await this.runPrimary('putRequest', [record]);
    return record;
  }

  async getRequest(nonce) {
    const primary = await this.runPrimary('getRequest', [nonce]);
    return primary || this.fallback.getRequest(nonce);
  }

  async getReceipt(ledgerKey) {
    const primary = await this.runPrimary('getReceipt', [ledgerKey]);
    return primary || this.fallback.getReceipt(ledgerKey);
  }

  async consumeOnce(options) {
    // The fallback is also the continuity marker if IndexedDB is later
    // cleared, denied, or downgraded by a webview. Consult it first so a
    // storage failover cannot re-emit a result already accepted elsewhere.
    const fallbackReceipt = await this.fallback.getReceipt(options.ledgerKey);
    if (fallbackReceipt) return { status: 'duplicate', receipt: fallbackReceipt };
    if (this.primary) {
      try {
        const result = await this.primary.consumeOnce(options);
        if (result.status === 'accepted') {
          await this.fallback.consumeOnce({
            ...options,
            accept: () => result.receipt
          });
        }
        return result;
      } catch (error) {
        // Validation errors are authored host decisions, not storage failures.
        if (error && error.name === 'ExplorationHostError') throw error;
        this.primaryError = error;
        try { this.primary.close(); } catch (_) {}
        this.primary = null;
      }
    }
    return this.fallback.consumeOnce(options);
  }

  close() {
    try { this.primary?.close(); } catch (_) {}
    try { this.fallback.close(); } catch (_) {}
  }
}

export function createHostDatabase({ indexedDB = globalThis.indexedDB, storage, name, prefix } = {}) {
  const fallback = new StorageHostDatabase(storage, { prefix });
  let primary = null;
  try {
    if (indexedDB && typeof indexedDB.open === 'function') primary = new IndexedDbHostDatabase(indexedDB, { name });
  } catch (_) {
    primary = null;
  }
  return new FailoverHostDatabase(primary, fallback);
}
