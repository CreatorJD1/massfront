# MASSFRONT economy — server-authoritative currency

Status: **NOT DEPLOYED.** Worker source, schema, and client are written and
verified against a local D1 instance (see "What was verified locally"
below). No Cloudflare credentials were available in this environment, and
none were sought — deployment is the exact commands at the bottom of this
file, for a human with dashboard/API-token access to run.

---

## ADR-1: client/server authority split for progression state

**Status:** Accepted
**Date:** 2026-08-01
**Deciders:** MASSFRONT engineering

### Context

All progression today lives in `localStorage` (`src/game/meta.js`, `META`
object) — cores, XP, unlocks, career stats. That is fine for a single-player
game. It stops being fine the moment cores are sellable for real money:
`META.cores = 999999` in a browser console mints currency, and because
`src/authportal.js` already syncs `META` to the cloud (`PUT /save` in
`cloudflare/massfront-auth`), a fabricated local balance becomes a
fabricated *server* balance the instant a player signs in — indistinguishable
from a real one, because nothing server-side ever independently priced or
audited it.

The fix is not "move everything to the server" — a mobile RTS that requires
a network round trip to toggle Fog of War, or to remember a win/loss
counter, is a worse game and violates `src/offline.js`'s standing contract
("a player on a plane... gets the whole game"). The fix is authority over
**value that can be spent for real money or converted to it**, and nothing
more.

### Decision

Split `META`'s fields into two categories:

| Authoritative (server, `cloudflare/massfront-economy`) | Client-only (`localStorage`, unchanged) |
|---|---|
| `cores` balance | `xp`, rank progress |
| Store purchases / entitlements (`owned{}` perk tiers, commander colors) | `settings{}` (sound, music, fog, perf, menu backdrop) |
| — | `wcPref`, career stats (`wins`, `losses`, `kills`, `streak`, `bestStreak`, `playSec`, `built`, `favFac`, `facWins`, `mapWins`, ...) |
| — | profile identity (`name`, `emblem`) |

**Why cores and purchases, specifically:**
- `cores` is the thing with a real-money exchange rate on the roadmap. It is
  the entire attack surface the task describes ("players can mint the
  currency being sold"). Nothing else in `META` has that property.
- Store entitlements (`owned.armor`, `owned.orbital`, `col_gold`, ...) are
  downstream of cores — a perk tier IS a receipt for a cores spend. If cores
  are authoritative but entitlements are not, a player can still edit
  `META.owned.orbital = 1` locally and get the Orbital Lance ability for
  free; the entitlement has to be authoritative for the same reason the
  currency that bought it is.

**Why everything else stays client-only:**
- **XP / rank** have no exchange rate and no purchase behind them — inflating
  your own rank number is a vanity edit with no effect on any other player
  or on MASSFRONT's revenue. (If XP ever gates something sellable — a
  cosmetic unlock, a leaderboard with a prize — it moves into the
  authoritative column at that point, not before; this split is deliberately
  minimal, not maximal.)
- **Settings and cosmetic preference** (`wcPref`, `menubg`, sound toggles)
  are, definitionally, about this device. Server-authoritative settings would
  mean a phone with no signal can't turn its own sound off — a worse
  experience for zero anti-cheat benefit.
- **Career stats** (kills, streaks, playtime) are for the player to look at
  in their own Profile screen. Nothing reads them to grant value. They can be
  wrong the same way an odometer with a disconnected sensor can be wrong —
  regrettable, not exploitable.

### Options considered

**A. Everything authoritative (full server save-state).** Every `metaSave()`
becomes a network call. Rejected: violates the offline contract outright,
adds latency to Settings toggles, and moves stats/XP into scope that gains
nothing from server authority while adding a real one (the server becomes a
single point of failure for *playing*, not just *spending*).

**B. Nothing authoritative, server just double-checks on cloud-save pull
(anomaly detection only).** Rejected: this is what exists today in spirit
(cloud save already round-trips `META` byte-for-byte) and is exactly the
hole the task is closing — "double-checking" a client-supplied number after
the fact is advisory, not authoritative; it can flag `META.cores=999999` as
suspicious but cannot stop it from being spendable in the window before
anyone looks.

**C (chosen). Currency + entitlements authoritative, everything else
client-only, reconciled opportunistically.** Bounds the new server's blast
radius (and its availability requirement) to exactly the state with a
real-money attack surface, keeps the offline contract intact for the other
95% of `META`, and reuses the existing session/auth infrastructure instead
of inventing a second one.

### Consequences

- A signed-out or offline player still earns and spends "cores" — just
  client-side ones, exactly as today. `src/economy-net.js` layers on top of
  that, it does not replace it (see "degradation" below).
- `META.cores` and the server ledger can disagree between sign-ins (a player
  who earned cores offline, then signs in on a second device). Reconcile
  resolves this by having the server always win on conflict — see
  `ecoReconcile()` in `src/economy-net.js`.
- Two systems now touch cores: the legacy local-only path (`metaGrant`,
  `renderArmory` in `src/game/meta.js`) and the new server path. This file's
  "known limitations" section below is explicit about which spend path is
  and is not currently wired to the server, and why.

### Action items
1. [x] Schema: `balances`, `ledger`, `entitlements`, `catalog`, rate-limit log.
2. [x] Worker: `GET /balance`, `POST /grant`, `POST /spend`, `GET /entitlements`.
3. [x] Client: `src/economy-net.js`, wired to match rewards and sign-in.
4. [ ] Wire `src/game/meta.js` `renderArmory()` purchase buttons to
   `EconomyNet.spend()` instead of local-only `META.cores -=`. Not done in
   this change — see "known limitations".
5. [ ] Deploy (human with Cloudflare credentials — see bottom of this file).

---

## Schema — `cloudflare/massfront-economy/schema.sql`

Binds the **same** D1 database as `massfront-auth`
(`massfront-accounts`, `e3c74e0d-59b8-427e-92b8-ea8a3bbd6573`). This worker
never creates or writes `users`/`sessions`/`saves`/`attempts` — those belong
to `cloudflare/massfront-auth/schema.sql` — it only reads `sessions`/`users`
to authenticate a bearer token. New tables, all namespaced away from that
worker's:

- **`balances`** — one row per user, `cores INTEGER CHECK (cores >= 0)`. A
  materialized cache of the ledger sum, kept in lockstep with every ledger
  write inside the same D1 transaction. The `CHECK` constraint is not
  decorative — see "double-spend races" below.
- **`ledger`** — every credit and debit, ever, with a `reason`, a
  `balance_after` snapshot, and a `UNIQUE(user_id, idem_key)` index. This
  table is *why* a balance can be refunded, reconciled, or defended: "you
  were not charged twice for Composite Armor, here is the one row where you
  were charged, at `2026-08-01T...`, for tier 2, leaving you at 1,600
  cores" is an answerable question because of this table, not despite it.
- **`entitlements`** — one row per `(user, sku)`, current owned `tier`. What
  `GET /entitlements` reads; a materialized projection of the ledger's
  `purchase:*` rows, same rationale as `balances`.
- **`catalog`** — `(sku, tier) -> price`, seeded to match `STORE[]` /
  `COLORS{}` in `src/game/meta.js` today. The reason `/spend` never trusts a
  client-sent price: it looks the price up here.
- **`econ_rate_events`** — sliding-window log for the grant/spend rate
  limiter, same technique `massfront-auth/schema.sql`'s `attempts` table
  uses, kept as its own table so this worker never writes into a table that
  worker's schema owns.

## Worker — `cloudflare/massfront-economy/`

```
GET  /balance                 -> {ok, cores, updatedAt}
GET  /entitlements             -> {ok, entitlements:[{sku,tier,grantedAt,updatedAt}]}
POST /grant  {amount,reason,idempotencyKey}         -> {ok, granted, balance, idempotent}
POST /spend  {sku,idempotencyKey}                   -> {ok, spent, sku, tier, balance, idempotent}
```

All four require `Authorization: Bearer <token>` — the **same session
token** `massfront-auth` issues on `/login` or `/register`. This worker does
not run its own login; it reads the `sessions` table `massfront-auth`
writes, in the same D1 database, so "signed in to the account server" and
"signed in here" are the same fact, not two that can drift apart.

### Idempotency (the requirement that matters)

Every `/grant` and `/spend` call takes a caller-supplied `idempotencyKey`.
Order of operations in both handlers:

1. **Look up** an existing ledger row for `(user_id, idem_key)`. If found,
   the operation already happened — return *that* row's result, unchanged,
   `idempotent:true`. No balance mutation, no rate-limit charge. This is
   what makes retrying a request the client couldn't confirm succeeded (the
   literal "match-reward grant retried after a flaky connection" case) safe.
2. **Rate limit** — only checked for genuinely new operations, so a retry of
   an already-applied grant can never itself get rejected as "too many
   requests."
3. **Write**, inside one `env.DB.batch()` (a single D1 transaction): insert
   the ledger row + update the balance (+ upsert the entitlement, for
   spend). The `UNIQUE(user_id, idem_key)` index is the actual backstop for
   the race the pre-check above doesn't close: two requests for the same
   *new* key arriving at the same instant can both pass step 1 before either
   has written. Whichever's `INSERT` loses that race gets a constraint
   violation, the *entire* batch rolls back (nothing partially applies), the
   worker catches that specific failure, re-reads the winner's row, and
   returns it exactly like a normal replay.

**Verified under real concurrency**, not just reasoned about — see below.

### Server-side pricing

`/spend` takes a `sku`. Never a price, never a tier, never an amount. The
worker reads the caller's current tier from `entitlements`, looks up
`catalog[sku][currentTier+1]`, and charges exactly that. There is no field
in the request body a client could set to change what it pays.

### Balance integrity under concurrency (double-spend races)

`balances.cores` has `CHECK (cores >= 0)`. A spend's balance update is
`cores = cores - ?`, with no separate "would this go negative" branch in
application code — the pre-write `SELECT` balance check exists only to give
a fast, friendly `402` in the common case. The actual guarantee is
structural: if two concurrent spends would take a player negative, the
second `UPDATE`, being inside the same batch/transaction as *that* spend's
ledger insert, violates the constraint and the whole operation for the
loser rolls back atomically — clean `402`, not a negative balance, not a
half-written ledger row. Also verified under real concurrency below.

### Rate limiting

`econ_rate_events`, sliding window, **keyed by `user_id`** (every call here
is already authenticated, so there's no "no account yet" case the way
`massfront-auth`'s per-IP register limit has to handle). `grant`: 20 per 5
minutes per user. `spend`: 30 per 5 minutes. 20 grants/5min is generous
headroom over one real match payout every several minutes — "a client that
claims 400 match rewards a minute" hits `429` almost immediately, well
before it can do real damage, and legitimate retries (idempotent replays)
never count against the window at all.

### Known limitation, stated plainly

This worker enforces that a grant is well-formed, capped
(`MAX_GRANT_PER_CALL = 2000` — sized generously above what a maxed-difficulty,
full-wildcard-stack, boosted match legitimately pays via `metaGrant()` in
`src/game/meta.js`, not tightly against it), rate-limited, and durably
audited. It does **not** independently recompute a match's reward from
server-side match telemetry — there is no authoritative match simulation on
this server; MASSFRONT's RTS runs entirely client-side, and building a
server-side match verifier is a materially larger project than a currency
ledger. A player who reverse-engineers the client can still claim close to
`MAX_GRANT_PER_CALL` cores per call, up to the rate limit, on demand. What
this fully closes is the problem actually stated in the task: no amount of
`META.cores = 999999`-style client tampering can change what `/balance`
reports, because that number is never read from the client, ever — it is
computed entirely from the server's own ledger.

The other explicit known gap: **`src/game/meta.js`'s Armory purchase UI
(`renderArmory`) is not wired to this worker.** It still spends
`META.cores` locally only, exactly as it did before this change. Rewiring
it means editing that function's DOM event handlers, which are in a file
outside this change's ownership; `EconomyNet.spend()` is a complete, tested,
ready-to-call function for whoever does that wiring next — see
`src/economy-net.js`'s file header, "what is NOT wired here, and why". Until
then, an Armory purchase is reconciled the same way any other local-vs-server
disagreement is: the server ledger wins the next time `ecoReconcile()` runs,
which means a local-only "purchase" that the server never heard about is
NOT retroactively granted as a server entitlement — it is a display-only
unlock on that one device until the wiring above exists. This is called out
so it is not mistaken for "the store is server-authoritative now" — it is
not, yet; the currency balance is.

---

## Client — `src/economy-net.js`

Loads after `src/offline.js`, `src/game/meta.js`, `src/authportal.js` and
`src/account.js` (see `boot.js` / `assets/data/manifest.json` order) and
integrates by **wrapping** three existing globals — the same non-invasive
pattern `src/offline.js` already uses on `renderSettings` — rather than
editing those files:

- `metaGrant` (match payout) → after the existing local grant, also queues
  `EconomyNet.grant(cores, 'match_reward')`.
- `apSetSessionFrom` (successful sign-in/register) → triggers
  `EconomyNet.reconcile()`.
- `apClearSession` (sign-out) → drops the confirmed balance/entitlements
  (they belonged to the account just signed out of).

### Degradation contract

- **Never blocks gameplay.** Every exported function returns/queues
  immediately; nothing in the game loop or UI awaits a fetch.
- **Signed-out or offline is normal, not an error.** `META.cores` is what
  the player plays with the entire time; this file only ever *adjusts* it
  from a confirmed server response (on reconcile), never gates or hides it.
- **Grants queue offline; spends do not.** A queued grant (`ecoGrant`) is
  low-risk to apply late — crediting currency retroactively is purely
  additive. A queued *spend* would mean showing an item as "owned" before
  the server has confirmed there was ever a balance to pay for it, which is
  the exact class of bug this whole system exists to prevent. `ecoSpend()`
  requires being online and signed in and returns a clear, non-throwing
  `{ok:false, error:'offline', ...}` otherwise — it never silently succeeds.
- **Never shows an unconfirmed balance as confirmed.** `EconomyNet.getBalance()`
  returns `{cores, confirmed, lastSync}` — `confirmed` is `false` until an
  actual `/balance` response has been read this session; nothing here ever
  synthesizes a number and marks it true.
- **Reconcile on sign-in**, and the server always wins a disagreement: after
  a full offline-queue flush, `ecoReconcile()` pulls `/balance` and
  `/entitlements` and, if `META.cores` differs from the server figure,
  overwrites `META.cores` with the server's — that overwrite is the entire
  point of "server-authoritative": the number a human can edit loses.

### Offline queue

`ecoGrant()` writes to a `localStorage`-persisted queue
(`massfront_econ_queue_v1`) before attempting to send — so a grant survives
an app kill, not just a network blip. Each queued operation mints its
idempotency key **once**, at queue time, and every retry (including across
restarts) resends that same key; `ecoFlush()` drains the queue strictly in
order and stops at the first failure, leaving the remainder queued rather
than reordering or dropping anything behind it. Flush triggers: right after
queuing, on `window online`, on sign-in reconcile, and a 45s idle-poll
fallback for WebViews that don't fire the `online` event reliably.

---

## What was verified locally

Run against `npx wrangler dev --local --port 8788` (its own throwaway D1,
schema loaded from both `cloudflare/massfront-auth/schema.sql` — for
`users`/`sessions` — and `cloudflare/massfront-economy/schema.sql`), with two
seeded test users/sessions, using `curl`. All of the following were
observed directly, not assumed:

- No `Authorization` header → `401`. Expired session token → `401`.
- `GET /balance` on a brand-new user lazily initializes to `0` rather than
  erroring.
- `POST /grant` with a new idempotency key → `201`, balance increases by
  exactly `amount`.
- **Replaying the identical `idempotencyKey`** → `200`, `idempotent:true`,
  balance unchanged (not doubled).
- **Replaying the same key with a different (still-valid) amount** → the
  *original* amount/balance is returned, confirming the server ignores the
  client's second attempt to change the terms of an already-settled
  operation.
- **5 concurrent identical new `/grant` requests** (same never-seen-before
  idempotency key, fired in parallel with backgrounded `curl`) → exactly one
  `idempotent:false` (`201`), four `idempotent:true`; balance moved by
  `amount` exactly once; exactly one matching row in `ledger`. This is the
  actual race the idempotency design targets, exercised for real.
  Confirmed cross-account isolation alongside it: a second user's balance
  was untouched by the first user's grants throughout.
  - amount `0`, negative, non-numeric, or over `MAX_GRANT_PER_CALL` → `400`.
  - missing `idempotencyKey` → `400`.
- **Grant rate limit**: 25 rapid new-keyed grants for one user against a
  20/5-minute limit → exactly 20 succeeded (`201`), the rest `429`, with the
  math confirmed against grants already issued earlier in the same window.
- `POST /spend`: price for a sku's tier comes from `catalog`, confirmed by
  buying the same sku twice in a row and observing the *second* purchase
  charged the tier-2 price, not tier-1 again; `entitlements` reflected
  `tier:2` afterward.
  - Insufficient balance → `402`, no state changed.
  - Unknown sku / already at max tier → `404`.
  - Replaying a spend's idempotency key → `200`, `idempotent:true`, original
    `spent`/`tier`/`balance` returned, balance not re-debited.
- **2 concurrent `/spend` requests for the same sku**, each individually
  affordable but not both together (`420` cores each against an `800`
  balance) → exactly one `201` (balance debited once, to `380`), one clean
  `402` ("a concurrent purchase used the balance first"), balance verified
  at exactly `380` afterward (never negative, never double-charged), and
  exactly **one** `ledger` row for that sku — confirming the
  `CHECK(cores>=0)`-driven transactional rollback under real concurrency,
  not just in the code's design intent.
- Reusing one idempotency key across a `/grant` then a `/spend` → the second
  call is rejected `409 idempotency_key_reused` rather than silently
  returning the first call's (wrong-shaped) cached result.
- Malformed JSON body → `400`. Wrong HTTP method → `405`. `OPTIONS`
  preflight → `204` with the expected CORS headers.

Not verified (no deploy credentials, out of this pass's time budget):
production deploy itself, `wrangler dev` in **remote** mode against the real
`massfront-accounts` database, and the `src/economy-net.js` client against a
real browser/WebView (its request/response shapes match what the worker
above was directly confirmed to return, but it was not exercised end-to-end
in the game itself).

---

## Deploy instructions (a human with Cloudflare credentials must run these)

```bash
cd cloudflare/massfront-economy
npm install                 # pulls in wrangler, same as massfront-auth

# Apply this worker's schema to the EXISTING massfront-accounts database.
# (Same database massfront-auth already uses — do not create a new D1.)
npx wrangler d1 execute massfront-accounts --file=schema.sql --remote

# Deploy the worker.
npx wrangler deploy
```

That prints a `*.workers.dev` URL (or your configured route). Then, to wire
the client to it, do ONE of:

- Set `window.MASSFRONT_ECONOMY_URL = "https://<your-worker>.workers.dev"`
  before `boot.js` runs (embedder-level config), or
- Add an `economyUrl` field to the same `assets/auth.json` the auth portal
  already reads for `syncUrl`, or
- Call `localStorage.setItem('massfront_econ_url', '<url>')` on-device
  (mirrors `authportal.js`'s "Set server URL" affordance, but there is no UI
  wired up for this one yet — console-only for now).

To test locally first (recommended before touching the real database):

```bash
cd cloudflare/massfront-economy
npx wrangler dev --local --port 8788
# in another shell, load BOTH schemas into the local throwaway D1
# (massfront-auth's, for users/sessions; this worker's own, for the rest):
npx wrangler d1 execute massfront-accounts --local --file=../massfront-auth/schema.sql
npx wrangler d1 execute massfront-accounts --local --file=./schema.sql
# then seed a test user + session row directly (there is no local
# massfront-auth instance to register through), and curl /balance, /grant,
# /spend, /entitlements with an `Authorization: Bearer <that token>` header.
```

**This has not been deployed.** The commands above are exact and were not
run against any real Cloudflare account in this pass.
