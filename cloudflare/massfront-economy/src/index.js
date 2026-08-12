/* ============================================================================
   MASSFRONT ECONOMY SERVER  —  Cloudflare Worker + D1
   ----------------------------------------------------------------------------
   Server-authoritative currency. Everything this worker owns answers one
   question: "what does the player actually have, and can we prove it?" —
   never "what does the client say it has."

     GET  /balance        (Authorization: Bearer <token>) -> {ok,cores,updatedAt}
     GET  /entitlements     "                              -> {ok,entitlements:[...]}
     POST /grant             "   {amount,reason,idempotencyKey}       -> {ok,granted,balance,idempotent}
     POST /spend              "   {sku,idempotencyKey}                -> {ok,spent,sku,tier,balance,idempotent}

   ---- authentication ---------------------------------------------------------
   Reuses the SAME session tokens as massfront-auth: this worker reads (never
   writes) the `sessions`/`users` tables in the same D1 database. There is no
   separate login here — a player who is signed in to the account server is,
   by construction, signed in here too. See requireSession() below, which is
   the same lookup massfront-auth/src/index.js does.

   ---- idempotency (the requirement that matters) ------------------------------
   Every /grant and /spend takes a caller-supplied `idempotencyKey`. The
   ledger table has a UNIQUE(user_id, idem_key) index — that constraint, not
   the pre-check in front of it, is what makes a retried request safe:

     1. Cheap optimistic check: look up an existing ledger row for this
        (user, idem_key). If found, the operation already happened — return
        THAT row's result, unchanged, with `idempotent:true`. No balance
        mutation, no rate-limit charge.
     2. Otherwise do the real work inside one env.DB.batch() — a single D1
        transaction — that inserts the ledger row and updates the balance
        (and entitlement, for spend) together. If two requests for the same
        new idem_key race past step 1 simultaneously, the second one's INSERT
        collides with the UNIQUE index and the whole batch fails atomically
        (nothing partially applies); the worker catches that specific
        failure, re-reads the row the winner just wrote, and returns it the
        same way a normal replay would. Either path, a retried grant or spend
        is applied exactly once.

   ---- server-side pricing ------------------------------------------------------
   /spend takes a `sku`, never an amount or a price. The price is looked up
   from the `catalog` table for (sku, currentOwnedTier+1) and that is what is
   charged — a client cannot talk the server into a different price than the
   one it would compute on its own, because the client never gets to send one.

   ---- balance integrity under concurrency ---------------------------------------
   `balances.cores` has CHECK(cores >= 0) (see schema.sql). A spend's balance
   UPDATE is `cores = cores - ?`, with no separate "is this negative" branch
   in application code — if two concurrent spends would take a player
   negative, SQLite's constraint rejects the second UPDATE, which (being
   inside the same batch/transaction as that spend's ledger insert) rolls the
   whole operation back. The loser gets a clean 402 insufficient_funds, not a
   negative balance and not a partially-recorded ledger entry.

   ---- rate limiting (grants) ----------------------------------------------------
   A sliding window over `econ_rate_events`, same technique massfront-auth
   uses for login/register (see checkRateLimit there) — keyed by user_id
   here, not IP, because every call is already authenticated. Checked AFTER
   the idempotency lookup so a legitimate retry of an already-applied grant
   is never rejected for "too many requests" — only genuinely NEW operations
   count against the window. See RATE_LIMITS below.

   ---- known limitation, stated plainly ------------------------------------------
   This worker verifies that a grant is well-formed, capped, rate-limited,
   and durably audited — it does NOT independently recompute a match's
   reward from server-side match telemetry (there is no authoritative match
   simulation on this server; the game runs entirely client-side). A
   sufficiently motivated cheater who reverse-engineers the client can still
   claim `MAX_GRANT_PER_CALL` cores per grant, up to the rate limit, more
   often than a legitimate player would. What this DOES fully close is the
   original problem: no amount of client tampering can move the number
   `/balance` reports, because that number is never read from the client. See
   docs/ECONOMY.md "what this does and does not defend against".
   ============================================================================ */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...CORS,
      ...extra,
    },
  });
const err = (status, error, message) => json({ error, message }, status);

/* ---- tunables ----------------------------------------------------------------
   MAX_GRANT_PER_CALL is deliberately generous — high difficulty + a full
   wildcard stack + boosters can legitimately clear ~1000 in metaGrant()
   (src/game/meta.js) — this is a coarse ceiling against "grant(999999)", not
   a tight bound on the real formula (which this server does not recompute;
   see the file header). Tighten it once match telemetry is verifiable
   server-side. */
const MAX_GRANT_PER_CALL = 2000;
const MAX_REASON_LEN = 64;
const RATE_LIMITS = {
  grant: { limit: 20, windowSec: 300 },   // 20 grants / 5 min / user — a real match pays out at most once every few minutes
  spend: { limit: 30, windowSec: 300 },
};

/* ---- auth: identical lookup to massfront-auth/src/index.js requireSession —
   both workers bind the same D1 database, and this one owns none of the
   rows it is reading here. */
async function requireSession(request, env) {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m || !m[1].trim()) return null;
  const token = m[1].trim();
  const row = await env.DB.prepare(
    'SELECT s.token, s.user_id, s.expires_at, u.email AS email ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1'
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at <= Date.now()) return null;   // do not delete here — this worker doesn't own `sessions`; massfront-auth prunes expired rows on its own lookups
  return row;
}

/* ---- rate limiting (see file header) ------------------------------------------ */
async function checkRateLimit(env, bucket, userId) {
  const rule = RATE_LIMITS[bucket];
  const cutoff = Date.now() - rule.windowSec * 1000;
  const key = String(userId);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM econ_rate_events WHERE bucket=?1 AND akey=?2 AND created_at>?3'
  ).bind(bucket, key, cutoff).first();
  if (row && row.n >= rule.limit) return false;
  await env.DB.prepare('INSERT INTO econ_rate_events (bucket, akey, created_at) VALUES (?1,?2,?3)')
    .bind(bucket, key, Date.now()).run();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM econ_rate_events WHERE created_at < ?1')
      .bind(Date.now() - 86400000).run().catch(() => {});
  }
  return true;
}

/* ---- balance -------------------------------------------------------------- */
async function ensureBalanceRow(env, userId) {
  const row = await env.DB.prepare('SELECT cores, updated_at FROM balances WHERE user_id=?1').bind(userId).first();
  if (row) return row;
  const now = Date.now();
  /* INSERT OR IGNORE so two concurrent first-ever calls for the same brand
     new user don't race each other into a UNIQUE(user_id) violation. */
  await env.DB.prepare('INSERT OR IGNORE INTO balances (user_id, cores, updated_at) VALUES (?1,0,?2)')
    .bind(userId, now).run();
  return { cores: 0, updated_at: now };
}

/* ---- idempotency lookup ----------------------------------------------------
   Shared by /grant and /spend: find a prior ledger row for this (user,
   idem_key), if any, and hand back the reconstructed response. */
async function findLedgerByIdemKey(env, userId, idemKey) {
  return env.DB.prepare(
    'SELECT id, kind, delta, reason, balance_after, meta, created_at FROM ledger WHERE user_id=?1 AND idem_key=?2'
  ).bind(userId, idemKey).first();
}
function isUniqueConflict(e) {
  return e && /UNIQUE/i.test(e.message || '');
}
/* Always the number a response hands to a client — see "known limitation:
   balance_after can be stale under concurrency" below. Never `balance_after`
   from a ledger row for anything the client will trust as current. */
async function currentBalance(env, userId) {
  const row = await env.DB.prepare('SELECT cores FROM balances WHERE user_id=?1').bind(userId).first();
  return row ? row.cores : 0;
}

/* ---- validation -------------------------------------------------------------- */
function validIdemKey(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 128) return null;
  return s;
}

/* ---- handlers --------------------------------------------------------------- */
async function handleBalance(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const bal = await ensureBalanceRow(env, s.user_id);
  return json({ ok: true, cores: bal.cores, updatedAt: bal.updated_at });
}

async function handleEntitlements(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const { results } = await env.DB.prepare(
    'SELECT sku, tier, granted_at AS grantedAt, updated_at AS updatedAt FROM entitlements WHERE user_id=?1 AND tier>0 ORDER BY sku'
  ).bind(s.user_id).all();
  return json({ ok: true, entitlements: results || [] });
}

async function handleGrant(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }

  const idemKey = validIdemKey(body && body.idempotencyKey);
  if (!idemKey) return err(400, 'invalid_idempotency_key', 'idempotencyKey is required (a short unique string per operation, e.g. "match:<id>").');

  const amount = Math.trunc(Number(body && body.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_GRANT_PER_CALL)
    return err(400, 'invalid_amount', 'amount must be a positive integer, at most ' + MAX_GRANT_PER_CALL + ' per grant.');

  const reason = String((body && body.reason) || '').trim();
  if (!reason || reason.length > MAX_REASON_LEN)
    return err(400, 'invalid_reason', 'reason is required (max ' + MAX_REASON_LEN + ' chars), e.g. "match_reward".');

  /* 1. Idempotent replay — checked BEFORE the rate limit, so retrying an
        already-applied grant never burns rate-limit budget or gets a 429. */
  const existing = await findLedgerByIdemKey(env, s.user_id, idemKey);
  if (existing) {
    if (existing.kind !== 'grant')
      return err(409, 'idempotency_key_reused', 'This idempotencyKey was already used for a different operation (spend).');
    return json({ ok: true, granted: existing.delta, balance: await currentBalance(env, s.user_id), idempotent: true });
  }

  /* 2. Rate limit — only real, new grants count. */
  if (!(await checkRateLimit(env, 'grant', s.user_id)))
    return err(429, 'rate_limited', 'Too many grants for this account recently — slow down.');

  await ensureBalanceRow(env, s.user_id);
  const now = Date.now();
  /* balanceAfter is a BEST-EFFORT snapshot for the ledger row's own record,
     computed from a read that happens before this batch commits — under a
     genuinely concurrent second grant/spend for the same user (different
     idem_key, landing at nearly the same instant) it can be stale by the
     time this batch actually commits, even though the UPDATE below (a
     relative `cores = cores + ?`) is itself race-safe and the running total
     always ends up correct. Never trust this value for anything
     client-facing — see currentBalance() and its call sites, which always
     re-read the live row instead. */
  const bal = await env.DB.prepare('SELECT cores FROM balances WHERE user_id=?1').bind(s.user_id).first();
  const balanceAfter = (bal ? bal.cores : 0) + amount;

  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ledger (user_id, kind, delta, reason, idem_key, balance_after, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)'
      ).bind(s.user_id, 'grant', amount, reason, idemKey, balanceAfter, now),
      env.DB.prepare('UPDATE balances SET cores = cores + ?1, updated_at = ?2 WHERE user_id = ?3')
        .bind(amount, now, s.user_id),
    ]);
  } catch (e) {
    if (isUniqueConflict(e)) {
      /* Lost a race against an identical concurrent request — the winner's
         row is now there; return it exactly like any other replay. */
      const row = await findLedgerByIdemKey(env, s.user_id, idemKey);
      if (row) return json({ ok: true, granted: row.delta, balance: await currentBalance(env, s.user_id), idempotent: true });
    }
    throw e;
  }

  return json({ ok: true, granted: amount, balance: await currentBalance(env, s.user_id), idempotent: false }, 201);
}

async function handleSpend(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }

  const idemKey = validIdemKey(body && body.idempotencyKey);
  if (!idemKey) return err(400, 'invalid_idempotency_key', 'idempotencyKey is required (a short unique string per operation, e.g. "buy:armor:2").');

  const sku = String((body && body.sku) || '').trim();
  if (!sku) return err(400, 'invalid_sku', 'sku is required.');

  /* 1. Idempotent replay — checked BEFORE the rate limit (same reasoning as
        handleGrant): a retried purchase must never itself get 429'd, and
        must never be charged rate-limit budget it already spent the first
        time it (successfully or not) reached the server. */
  const existing = await findLedgerByIdemKey(env, s.user_id, idemKey);
  if (existing) {
    if (existing.kind !== 'spend')
      return err(409, 'idempotency_key_reused', 'This idempotencyKey was already used for a different operation (grant).');
    const m = existing.meta ? JSON.parse(existing.meta) : {};
    return json({ ok: true, spent: -existing.delta, sku: m.sku || sku, tier: m.tier || null,
                  balance: await currentBalance(env, s.user_id), idempotent: true });
  }

  /* 2. Rate limit — only real, new purchases count. */
  if (!(await checkRateLimit(env, 'spend', s.user_id)))
    return err(429, 'rate_limited', 'Too many purchases for this account recently — slow down.');

  /* 3. Current tier + next price, both from the server, never the client. */
  await ensureBalanceRow(env, s.user_id);
  const ent = await env.DB.prepare('SELECT tier FROM entitlements WHERE user_id=?1 AND sku=?2').bind(s.user_id, sku).first();
  const currentTier = ent ? ent.tier : 0;
  const nextTier = currentTier + 1;
  const priceRow = await env.DB.prepare('SELECT price, max_tier FROM catalog WHERE sku=?1 AND tier=?2').bind(sku, nextTier).first();
  if (!priceRow) return err(404, 'unknown_sku_or_maxed', 'No such item, or it is already at its maximum tier.');

  const bal = await env.DB.prepare('SELECT cores FROM balances WHERE user_id=?1').bind(s.user_id).first();
  const cores = bal ? bal.cores : 0;
  if (cores < priceRow.price)
    return err(402, 'insufficient_funds', 'Not enough cores — need ' + priceRow.price + ', have ' + cores + '.');

  const now = Date.now();
  const balanceAfter = cores - priceRow.price;
  const meta = JSON.stringify({ sku, tier: nextTier });

  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ledger (user_id, kind, delta, reason, idem_key, balance_after, meta, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
      ).bind(s.user_id, 'spend', -priceRow.price, 'purchase:' + sku, idemKey, balanceAfter, meta, now),
      /* The guard that actually matters: if cores - price < 0 this violates
         balances' CHECK(cores>=0) and the WHOLE batch (this statement +
         the ledger insert + the entitlement upsert below) rolls back — the
         pre-check above is just for a fast, friendly error message. */
      env.DB.prepare('UPDATE balances SET cores = cores - ?1, updated_at = ?2 WHERE user_id = ?3')
        .bind(priceRow.price, now, s.user_id),
      env.DB.prepare(
        'INSERT INTO entitlements (user_id, sku, tier, granted_at, updated_at) VALUES (?1,?2,?3,?4,?4) ' +
        'ON CONFLICT(user_id, sku) DO UPDATE SET tier=excluded.tier, updated_at=excluded.updated_at'
      ).bind(s.user_id, sku, nextTier, now),
    ]);
  } catch (e) {
    if (isUniqueConflict(e)) {
      const row = await findLedgerByIdemKey(env, s.user_id, idemKey);
      if (row) {
        const m = row.meta ? JSON.parse(row.meta) : {};
        return json({ ok: true, spent: -row.delta, sku: m.sku || sku, tier: m.tier || null, balance: await currentBalance(env, s.user_id), idempotent: true });
      }
    }
    /* A CHECK(cores>=0) violation (the concurrency race) surfaces here as a
       generic D1 error, not a UNIQUE conflict — re-check balance to give the
       honest reason rather than a raw 500. */
    const fresh = await env.DB.prepare('SELECT cores FROM balances WHERE user_id=?1').bind(s.user_id).first();
    if (fresh && fresh.cores < priceRow.price)
      return err(402, 'insufficient_funds', 'Not enough cores — a concurrent purchase used the balance first.');
    throw e;
  }

  return json({ ok: true, spent: priceRow.price, sku, tier: nextTier, balance: await currentBalance(env, s.user_id), idempotent: false }, 201);
}

/* ---- router ------------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.DB) return err(500, 'not_configured', 'This worker has no D1 database bound yet — see docs/ECONOMY.md.');

    try {
      if (path === '/')
        return new Response(
          'MASSFRONT economy server\n\n  GET  /balance\n  GET  /entitlements\n  POST /grant\n  POST /spend\n',
          { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
      if (path === '/health') return json({ status: 'ok', service: 'massfront-economy' });

      if (path === '/balance')
        return request.method === 'GET' ? handleBalance(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/entitlements')
        return request.method === 'GET' ? handleEntitlements(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/grant')
        return request.method === 'POST' ? handleGrant(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/spend')
        return request.method === 'POST' ? handleSpend(request, env) : err(405, 'method_not_allowed', 'Use POST.');

      return err(404, 'route_not_found', 'No such endpoint.');
    } catch (e) {
      return err(500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
