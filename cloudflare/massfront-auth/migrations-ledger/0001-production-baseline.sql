-- ============================================================================
-- LEDGER 0001 — PRODUCTION BASELINE (the schema as it stood on 2026-08-19)
-- ----------------------------------------------------------------------------
-- This file is a PHOTOGRAPH, not a change. It reproduces exactly what the
-- production database already received on 19 August: the schema.sql committed
-- in 763de68, plus the two columns legacy migration 0001-social-columns.sql
-- added to `users` (inlined into the CREATE — see the note there).
--
-- WHY IT IS SHAPED THIS WAY
-- Production has this schema but NO d1_migrations ledger, because every
-- migration so far was applied by hand with `wrangler d1 execute --file=`.
-- Adopting the ledger therefore has to begin with a migration that is a
-- complete NO-OP against a database which already looks like this, so that
-- `wrangler d1 migrations apply` can record it and move on to 0002. Every
-- statement below is CREATE ... IF NOT EXISTS for exactly that reason, and
-- there is deliberately no ALTER: an ALTER here would abort against production
-- on its very first statement.
--
-- Against a FRESH database this same file builds the Aug-19 schema from
-- nothing, which is what makes the two paths converge.
--
-- DO NOT EDIT to add new objects. Later schema changes get their own numbered
-- file after this one, editing a migration already recorded in some
-- environment ledger is how environments silently diverge.
-- ============================================================================

-- MASSFRONT accounts — D1 schema
-- ----------------------------------------------------------------------------
-- This baseline is applied only through `wrangler d1 migrations apply` using
-- migrations_dir in wrangler.toml. Do not deploy schema.sql or this file with
-- a hand-run `d1 execute --file` command.
-- ============================================================================

-- One row per registered player. The password is never stored — pass_hash is
-- the PBKDF2-SHA256 output (hex) of the password combined with pass_salt, run
-- for pass_iter iterations. pass_iter is stored per-row (not hardcoded) so a
-- future deploy can raise the iteration count and transparently re-hash
-- existing accounts the next time they sign in successfully, without a
-- migration that touches every row up front.
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,   -- lowercased + trimmed before storage
  pass_hash  TEXT NOT NULL,          -- hex
  pass_salt  TEXT NOT NULL,          -- hex, random per user, >=16 bytes
  pass_iter  INTEGER NOT NULL,       -- PBKDF2 iterations used for pass_hash
  created_at INTEGER NOT NULL,       -- unix ms
  username   TEXT,                   -- public handle for friends, NULL until claimed
  age_ok     INTEGER NOT NULL DEFAULT 0,  -- 13+ confirmed. The date of birth itself is NEVER stored.
  age_checked_at INTEGER,
  -- Added on production by legacy migration 0001-social-columns.sql (Aug 19).
  -- Inlined here so the baseline is reproducible with CREATE alone: SQLite has
  -- no ALTER TABLE ... ADD COLUMN IF NOT EXISTS, and an ALTER in a baseline
  -- that must be a no-op against production would abort the whole apply.
  verified_at    INTEGER,
  social_banned  INTEGER NOT NULL DEFAULT 0
);
/* Case-insensitive uniqueness: `Vex` and `vex` cannot both exist, but the
   display keeps whatever case was claimed. */
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

-- Opaque bearer session tokens. Random, unguessable, stored server-side with
-- an expiry — this is the "real" session record, the token itself carries no
-- meaning on its own and cannot be forged or decoded (unlike a JWT), so
-- revocation is just deleting the row.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,       -- hex, >=32 random bytes
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- One save slot per account. `payload` is whatever the client's encodeSave()
-- produced (a deflate+base64url blob) — this table never parses or
-- understands it, so the save format can evolve without a server change.
CREATE TABLE IF NOT EXISTS saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sliding-window log for rate-limiting /register and /login. A row per
-- attempt, checks count rows newer than the window cutoff for a given
-- (bucket, key) pair. See src/index.js `checkRateLimit`, which also prunes
-- rows older than 24h on a small random fraction of requests so this table
-- never needs a separate cron job to stay small.
CREATE TABLE IF NOT EXISTS attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT NOT NULL,          -- 'register_ip' | 'login_ip' | 'login_email'
  akey       TEXT NOT NULL,          -- the IP address or email the bucket is keyed on
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_lookup ON attempts(bucket, akey, created_at);

-- ============================================================================
-- SOCIAL — verification, friends, blocking, reports          (added 2026-08)
-- ----------------------------------------------------------------------------
-- Everything below is IF NOT EXISTS, exactly like the four tables above, so
-- re-running this file is still a no-op. The four original tables are NOT
-- touched by anything in this section.
--
-- Production received the two `users` columns through the archived
-- migrations-legacy/0001-social-columns.sql before a ledger existed. They are
-- inlined into CREATE TABLE users below so this migration remains a no-op on
-- production and builds the same shape from scratch on a fresh database.
-- ============================================================================

-- A pending e-mail verification, one row per user (the row is REPLACED when a
-- new code is requested, so there is never more than one live code). The code
-- itself is never stored: code_hash is `<saltHex>$<pbkdf2Hex>`, the same
-- WebCrypto PBKDF2-SHA256 the passwords use, with a fresh random salt per
-- issue. A six-digit code only has a million possibilities, so a plain digest
-- would be trivially reversible from a database leak, salted PBKDF2 at the
-- project's iteration floor is not, and `attempts` caps online guessing at
-- VERIFY_MAX_ATTEMPTS before the row is destroyed.
CREATE TABLE IF NOT EXISTS email_verifications (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,          -- '<saltHex>$<pbkdf2Hex>' — never the code
  expires_at INTEGER NOT NULL,       -- unix ms
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- A friendship is ONE row, not two. Storing it twice (a->b and b->a) means
-- every write has to keep two rows consistent and every read has to dedupe,
-- the CHECK below makes the single canonical row unforgeable — lo_id is always
-- the smaller user id, so the primary key IS the pair identity and a duplicate
-- friendship cannot be inserted from the other direction.
CREATE TABLE IF NOT EXISTS friendships (
  lo_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hi_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lo_id, hi_id),
  CHECK (lo_id < hi_id)
);
/* The primary key already indexes lo_id, hi_id needs its own index because
   "who are my friends" scans both columns. */
CREATE INDEX IF NOT EXISTS idx_friendships_hi ON friendships(hi_id);

-- Outstanding invitations. status: 'pending' | 'accepted' | 'declined'.
CREATE TABLE IF NOT EXISTS friend_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  responded_at INTEGER
);
/* PARTIAL unique index: one live invitation per ordered pair, while leaving
   the historical accepted/declined rows unconstrained. A plain UNIQUE on
   (from_id,to_id) would mean a declined request could never be re-sent. This
   is what makes the dedupe in POST /social/friend/request a database
   guarantee rather than a hopeful SELECT-then-INSERT race. */
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending
  ON friend_requests (from_id, to_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_friend_requests_inbox
  ON friend_requests (to_id, status, created_at);

-- Blocking is DIRECTIONAL as stored (blocker_id blocked blocked_id) and
-- SYMMETRIC as enforced: every social action checks both directions, so the
-- blocked player cannot reach the blocker either. Storing it one way keeps
-- "who did I block" (the list the player manages) exact.
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
/* "am I blocked by them" is the other half of every check. */
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- Abuse reports. body_snapshot is a JSON blob captured at report time so the
-- evidence survives the reported player editing or deleting whatever prompted
-- it. It carries usernames and the reporter's reason — never an e-mail
-- address, see the snapshot builder in src/index.js.
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id   INTEGER NOT NULL,
  subject_user  INTEGER NOT NULL,
  body_snapshot TEXT,
  created_at    INTEGER NOT NULL,
  resolved      INTEGER NOT NULL DEFAULT 0
);
/* The moderation queue reads open reports oldest-first. */
CREATE INDEX IF NOT EXISTS idx_reports_open ON reports(resolved, created_at);

-- ----------------------------------------------------------------------------
-- NOT WIRED UP. There are no message routes in this release and none are
-- planned for it — direct messaging is a moderation surface that needs the
-- reporting flow above to already be live and load-bearing first. The table
-- shape is declared now only so the eventual migration is additive (routes,
-- not a schema change) and so the account-deletion purge in src/index.js can
-- already name it. Nothing reads or writes this table today.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    INTEGER NOT NULL,
  to_id      INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(to_id, created_at);
