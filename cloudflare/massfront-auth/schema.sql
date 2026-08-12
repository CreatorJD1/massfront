-- ============================================================================
-- MASSFRONT accounts — D1 schema
-- ----------------------------------------------------------------------------
-- Apply this to a database created with `wrangler d1 create massfront-accounts`
-- (see docs/ACCOUNTS.md for the full sequence). Safe to re-run: every
-- statement is IF NOT EXISTS, so applying it twice against the same database
-- is a no-op, not an error.
--
--   npx wrangler d1 execute massfront-accounts --file=schema.sql --remote
--
-- (drop --remote, or use --local, to apply it to the local dev database used
-- by `wrangler dev --local` instead of the real one.)
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
  username   TEXT,                   -- public handle for friends; NULL until claimed
  age_ok     INTEGER NOT NULL DEFAULT 0,  -- 13+ confirmed. The date of birth itself is NEVER stored.
  age_checked_at INTEGER
);
/* Case-insensitive uniqueness: `Vex` and `vex` cannot both exist, but the
   display keeps whatever case was claimed. */
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

-- Opaque bearer session tokens. Random, unguessable, stored server-side with
-- an expiry — this is the "real" session record; the token itself carries no
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
-- attempt; checks count rows newer than the window cutoff for a given
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
