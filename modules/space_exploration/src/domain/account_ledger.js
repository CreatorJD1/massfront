/* The account ledger the classic shell owns, read from the UGA module.
 *
 * UGA Command runs as its own document, so it cannot see the classic `META`
 * global. That is why it grew a second, parallel economy: the seven expedition
 * materials it renders are entirely its own, and Cores — the currency the player
 * actually earns from matches and spends on Arsenal Requisition — appeared
 * nowhere in the strategic home that is supposed to be their base.
 *
 * Both documents are same-origin, so localStorage is the shared surface, and
 * src/audio/space_audio.js already reads the same `massfront_meta_<profile>`
 * record for audio settings. This reuses that proven seam rather than inventing
 * a bridge. It is deliberately READ-ONLY: the classic shell stays the sole
 * writer of the ledger via metaGrantCores(), so there is exactly one earning
 * path and no chance of the two documents racing each other's saves.
 *
 * Rank is NOT derived here. The RANKS table lives in src/game/meta.js as a
 * classic script in the other document and cannot be imported; copying its
 * thresholds would silently drift the moment either side is retuned. Raw xp is
 * surfaced instead, and rank stays the classic shell's business.
 */

const PROFILE_INDEX_KEY = 'massfront_profiles_v1';
const PROFILE_META_PREFIX = 'massfront_meta_';

const storage = () => {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
};

const parse = raw => {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
};

const finite = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

/* profLoad() in meta.js guarantees {list:[{id}], active} once the shell has run
   once. Before that — a browser that has never opened the classic menu — there
   is no record, and 'default' matches the fallback space_audio.js already uses. */
export function activeProfileId() {
  const store = storage();
  if (!store) return 'default';
  const index = parse(store.getItem(PROFILE_INDEX_KEY));
  if (!index || !Array.isArray(index.list) || !index.list.length) return 'default';
  const active = typeof index.active === 'string' ? index.active : '';
  if (active && index.list.some(entry => entry && entry.id === active)) return active;
  const first = index.list.find(entry => entry && typeof entry.id === 'string');
  return first ? first.id : 'default';
}

export function accountLedgerStorageKey(profileId) {
  return `${PROFILE_META_PREFIX}${profileId || 'default'}`;
}

/* Missing, unreadable or half-written records must not blank the rail: a player
   with no classic progress legitimately has zero Cores, which is a real value,
   not an error. `present` distinguishes "no save yet" from "genuinely zero" for
   callers that want to hide the row entirely. */
export function readAccountLedger(profileId = activeProfileId()) {
  const store = storage();
  const record = store ? parse(store.getItem(accountLedgerStorageKey(profileId))) : null;
  return {
    profileId: profileId || 'default',
    present: Boolean(record && typeof record === 'object'),
    cores: finite(record?.cores),
    xp: finite(record?.xp),
    researchData: finite(record?.researchData),
    matches: finite(record?.matches),
    wins: finite(record?.wins)
  };
}

/* The classic shell can bank Cores while this document is open — a ground
   operation settles its result there and comes back. localStorage `storage`
   events fire cross-document on the same origin, which is exactly that case.
   A null event.key means the whole store was cleared, so re-read then too. */
export function subscribeAccountLedger(handler, profileId = activeProfileId()) {
  if (typeof handler !== 'function' || typeof globalThis.addEventListener !== 'function') return () => {};
  const key = accountLedgerStorageKey(profileId);
  const listener = event => {
    if (event && event.key && event.key !== key && event.key !== PROFILE_INDEX_KEY) return;
    handler(readAccountLedger(profileId));
  };
  globalThis.addEventListener('storage', listener);
  return () => globalThis.removeEventListener('storage', listener);
}
