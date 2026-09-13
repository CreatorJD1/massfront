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
 * Rank IS derived here, and the objection that used to sit in this comment was
 * the right one: RANKS lives in src/game/meta.js as a classic script in the
 * other document, cannot be imported, and a copied threshold table drifts the
 * moment either side is retuned - showing the player one rank in the main menu
 * and a different one aboard their own ship. The answer is not to go without a
 * rank, because a profile bar with no rank is a row of numbers. The answer is
 * to make the drift loud: tools/test-uga-rank-mirror.mjs parses RANKS straight
 * out of meta.js and fails the build if these two tables disagree by a single
 * threshold, name or glyph. Copy without a gate drifts; copy with a gate is a
 * mirror.
 */

/* MIRROR OF src/game/meta.js RANKS. Do not edit one without the other -
   test-uga-rank-mirror.mjs compares them element by element. */
export const ACCOUNT_RANKS = Object.freeze([
  Object.freeze({ nm: 'Recruit', em: '\u{1F397}', xp: 0 }),
  Object.freeze({ nm: 'Private', em: '\u{1F396}', xp: 200 }),
  Object.freeze({ nm: 'Corporal', em: '\u{1F949}', xp: 500 }),
  Object.freeze({ nm: 'Sergeant', em: '\u{1F948}', xp: 1000 }),
  Object.freeze({ nm: 'Lieutenant', em: '\u{1F947}', xp: 1800 }),
  Object.freeze({ nm: 'Captain', em: '\u{1F3C5}', xp: 3000 }),
  Object.freeze({ nm: 'Major', em: '\u2B50', xp: 4800 }),
  Object.freeze({ nm: 'Colonel', em: '\u{1F31F}', xp: 7500 }),
  Object.freeze({ nm: 'General', em: '\u2728', xp: 11500 }),
  Object.freeze({ nm: 'Warmaster', em: '\u{1F451}', xp: 17000 })
]);

/* Same shape as metaRankIdx() + metaRankProg() in meta.js, in one pass: the
   highest rank whose threshold the player has met, and how far they are into
   the next one. The top rank reports full progress and no next threshold,
   which is what the classic bar shows as MAX RANK. */
export function accountRank(xp) {
  const earned = Number.isFinite(Number(xp)) ? Number(xp) : 0;
  let index = 0;
  for (let i = 0; i < ACCOUNT_RANKS.length; i += 1) if (earned >= ACCOUNT_RANKS[i].xp) index = i;
  const rank = ACCOUNT_RANKS[index];
  const next = ACCOUNT_RANKS[index + 1] || null;
  const progress = next ? (earned - rank.xp) / (next.xp - rank.xp) : 1;
  return {
    index,
    level: index + 1,
    name: rank.nm,
    emoji: rank.em,
    xp: earned,
    nextXp: next ? next.xp : null,
    progress: Math.max(0, Math.min(1, progress)),
    max: !next
  };
}

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
