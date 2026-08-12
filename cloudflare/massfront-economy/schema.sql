-- ============================================================================
-- MASSFRONT economy — D1 schema
-- ----------------------------------------------------------------------------
-- Binds to the SAME database as massfront-auth (massfront-accounts,
-- e3c74e0d-59b8-427e-92b8-ea8a3bbd6573) — see wrangler.toml. This worker only
-- ever READS `users` / `sessions` (to authenticate a bearer token) and never
-- writes them; those tables and their schema are owned by cloudflare/
-- massfront-auth/schema.sql, not this file. Everything below is new and
-- namespaced away from that worker's tables (`users`, `sessions`, `saves`,
-- `attempts`) so the two schemas can never collide.
--
-- Apply with:
--   npx wrangler d1 execute massfront-accounts --file=schema.sql --remote
-- (drop --remote, or use --local, for the throwaway DB `wrangler dev --local`
-- creates automatically — see docs/ECONOMY.md.)
--
-- Safe to re-run: every CREATE is IF NOT EXISTS and the catalog seed uses
-- INSERT OR IGNORE, so applying this twice is a no-op, not an error.
-- ============================================================================

-- Current spendable balance, one row per user. This is a materialized cache
-- of `SUM(ledger.delta) WHERE user_id=?` kept in lockstep with every ledger
-- write inside the same D1 batch (transaction) — it exists so /balance is one
-- indexed row lookup instead of a scan, not because it is a second source of
-- truth. If the two ever disagree, the ledger is right (see docs/ECONOMY.md
-- "reconciliation").
--
-- CHECK(cores >= 0) is deliberate, not decorative: it is the actual guard
-- against double-spend races, not just the application-level balance check in
-- src/index.js. Two concurrent /spend calls for the same user can both pass
-- the pre-write SELECT balance check before either has written; the CHECK
-- constraint means whichever UPDATE runs second, inside its batch, violates
-- the constraint and the *entire* transaction (ledger insert + entitlement
-- upsert + balance update) rolls back atomically. The loser gets a clean 402,
-- not a negative balance.
CREATE TABLE IF NOT EXISTS balances (
  user_id    INTEGER PRIMARY KEY,   -- REFERENCES users(id) in the auth worker's schema (not FK-enforced across schemas in D1/SQLite, enforced in application code instead)
  cores      INTEGER NOT NULL DEFAULT 0 CHECK (cores >= 0),
  updated_at INTEGER NOT NULL
);

-- The audit trail. Every credit and debit, ever, with why. A balance you
-- cannot reconstruct from its history is one you cannot refund, reconcile, or
-- defend when a player says they were charged twice — this table is the
-- answer to that question, not an afterthought next to `balances`.
--
-- idem_key is what makes /grant and /spend safe to retry: it is caller-
-- supplied (the client mints one per logical operation — e.g. "match:<id>"
-- or "buy:<sku>:<tier>:<ts>") and UNIQUE per user. A retried request with the
-- same key hits that constraint on INSERT, the worker catches the conflict,
-- looks the row back up, and returns the ORIGINAL result instead of applying
-- the delta twice. See src/index.js `withLedgerEntry`.
CREATE TABLE IF NOT EXISTS ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  kind          TEXT NOT NULL,        -- 'grant' | 'spend'
  delta         INTEGER NOT NULL,     -- signed: +N for grant, -N for spend
  reason        TEXT NOT NULL,        -- 'match_reward' | 'daily_bonus' | 'purchase:<sku>' | ...
  idem_key      TEXT NOT NULL,        -- client-supplied idempotency key
  balance_after INTEGER NOT NULL,     -- cores.balance immediately after this entry — makes each row self-auditing without replaying the whole ledger
  meta          TEXT,                 -- optional small JSON blob (e.g. {"sku":"armor","tier":2}), never trusted, informational only
  created_at    INTEGER NOT NULL
);
-- The idempotency guarantee IS this constraint, not the application check
-- above it (which only closes the common case, not the race).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_idem ON ledger(user_id, idem_key);
CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON ledger(user_id, created_at);

-- What a player owns. One row per (user, sku); `tier` is the highest tier
-- currently owned (1-based) so re-buying the same sku is an upgrade, not a
-- duplicate. This is what GET /entitlements reads — it is a materialized
-- projection of "every spend ledger row with reason LIKE 'purchase:%'",
-- kept for the same reason `balances` is: cheap reads, not a second truth.
CREATE TABLE IF NOT EXISTS entitlements (
  user_id    INTEGER NOT NULL,
  sku        TEXT NOT NULL,
  tier       INTEGER NOT NULL DEFAULT 0,
  granted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, sku)
);

-- Server-side prices. THE reason /spend never trusts a client-sent amount:
-- the worker looks up `price` for (sku, currentTier+1) here and charges
-- exactly that, ignoring anything the client says a price is. Mirrors
-- STORE[] and COLORS{} in src/game/meta.js today (seeded below) — the two
-- are not code-linked (client and worker are deployed independently) so a
-- balance change here on a future re-deploy is how prices actually change;
-- editing meta.js's display copy alone no longer moves real money.
CREATE TABLE IF NOT EXISTS catalog (
  sku      TEXT NOT NULL,
  tier     INTEGER NOT NULL,     -- the tier this price buys (1-based)
  price    INTEGER NOT NULL,
  max_tier INTEGER NOT NULL,     -- redundant across a sku's rows on purpose: each row is self-contained, no join needed to know "is this maxed"
  kind     TEXT NOT NULL,        -- 'perk' | 'color'
  PRIMARY KEY (sku, tier)
);

-- Sliding-window rate-limit log for /grant (and lightly, /spend) — same
-- shape and technique as `attempts` in massfront-auth/schema.sql (a proven
-- pattern in this project), kept as its own table rather than reusing
-- `attempts` so this worker never has to write into a table another worker's
-- schema owns. Keyed by user_id, not IP: a grant is always authenticated, so
-- the thing worth throttling is "this account", not "this connection".
CREATE TABLE IF NOT EXISTS econ_rate_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT NOT NULL,      -- 'grant' | 'spend'
  akey       TEXT NOT NULL,      -- user_id as text
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_econ_rate_lookup ON econ_rate_events(bucket, akey, created_at);

-- ---- catalog seed -----------------------------------------------------------
-- Same ids, tiers and costs as STORE[] in src/game/meta.js. INSERT OR IGNORE
-- so re-running this file never clobbers a price that was deliberately
-- changed with a real UPDATE after launch.
INSERT OR IGNORE INTO catalog (sku, tier, price, max_tier, kind) VALUES
  ('cache',     1,  250, 1, 'perk'),
  ('armor',     1,  400, 3, 'perk'), ('armor',     2,  800, 3, 'perk'), ('armor',     3, 1600, 3, 'perk'),
  ('targeting', 1,  400, 3, 'perk'), ('targeting', 2,  800, 3, 'perk'), ('targeting', 3, 1600, 3, 'perk'),
  ('trade',     1,  350, 3, 'perk'), ('trade',     2,  700, 3, 'perk'), ('trade',     3, 1400, 3, 'perk'),
  ('neural',    1,  300, 2, 'perk'), ('neural',    2,  600, 2, 'perk'),
  ('capacitor', 1,  300, 2, 'perk'), ('capacitor', 2,  600, 2, 'perk'),
  ('salvage',   1,  400, 2, 'perk'), ('salvage',   2,  800, 2, 'perk'),
  ('droppod',   1,  350, 2, 'perk'), ('droppod',   2,  700, 2, 'perk'),
  ('reactor',   1,  380, 3, 'perk'), ('reactor',   2,  760, 3, 'perk'), ('reactor',   3, 1500, 3, 'perk'),
  ('bastion',   1,  420, 2, 'perk'), ('bastion',   2,  840, 2, 'perk'),
  ('orbital',   1, 1200, 1, 'perk'),
  ('col_emerald', 1, 300, 1, 'color'),
  ('col_gold',    1, 300, 1, 'color'),
  ('col_violet',  1, 300, 1, 'color'),
  ('col_frost',   1, 300, 1, 'color');
