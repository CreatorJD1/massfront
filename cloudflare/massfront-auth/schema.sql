-- ============================================================================
-- MASSFRONT accounts — D1 schema
-- ----------------------------------------------------------------------------
-- This file is a synchronized snapshot of the current schema. It is useful for
-- inspection and disposable local fixtures, but it is NOT the production
-- deployment mechanism. Ordered changes live in migrations-ledger/ and are
-- applied through Wrangler's migration ledger; see wrangler.toml.
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
  age_checked_at INTEGER,
  -- Added on production by legacy migrations-legacy/0001-social-columns.sql
  -- (19 Aug) and reproduced inline by migrations-ledger/0001-production-baseline.
  -- They live here too because this file is a SNAPSHOT of the current schema:
  -- if it omitted them it would not describe any real database, which is what
  -- test/migrations.test.mjs caught.
  verified_at    INTEGER,
  social_banned  INTEGER NOT NULL DEFAULT 0
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

-- ============================================================================
-- SOCIAL — verification, friends, blocks, reports, chat, presence (added 2026-08)
-- ----------------------------------------------------------------------------
-- Everything below is IF NOT EXISTS, exactly like the four tables above, so
-- re-running this file is still a no-op. The four original tables are NOT
-- touched by anything in this section.
--
-- The two legacy `users` columns are declared inline in this snapshot. On the
-- Aug-19 production database they were originally added by the archived
-- migrations-legacy/0001-social-columns.sql. Do not replay that ALTER file;
-- migrations-ledger/0001-production-baseline.sql safely converges fresh and
-- already-baselined databases before 0002/0003 are applied in order.
-- ============================================================================

-- A pending e-mail verification, one row per user (the row is REPLACED when a
-- new code is requested, so there is never more than one live code). The code
-- itself is never stored: code_hash is `<saltHex>$<pbkdf2Hex>`, the same
-- WebCrypto PBKDF2-SHA256 the passwords use, with a fresh random salt per
-- issue. A six-digit code only has a million possibilities, so a plain digest
-- would be trivially reversible from a database leak; salted PBKDF2 at the
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
-- every write has to keep two rows consistent and every read has to dedupe;
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
/* The primary key already indexes lo_id; hi_id needs its own index because
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
-- address; see the snapshot builder in src/index.js.
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
-- FRIEND CHAT FOUNDATION. Routes exist in the Worker, but the server reports
-- chat unavailable and rejects every send/list call unless the operator sets
-- SOCIAL_CHAT_ENABLED=1. The shipped wrangler.toml deliberately does not set
-- that flag. This keeps the schema additive and testable without silently
-- turning on a new user-generated-content surface.
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
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_to_page ON messages(to_id, created_at, id);

-- Authenticated global chat. Public feed rows deliberately contain only a
-- message, timestamp and the sender's public username (joined at read time).
CREATE TABLE IF NOT EXISTS world_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_world_messages_page
  ON world_messages(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_world_messages_user
  ON world_messages(user_id,created_at DESC,id DESC);

-- Ephemeral friend presence. `offline` is represented by no live row, so the
-- database never becomes a long-term activity log. Reads join through the
-- friendships table and filter blocks in both directions; there is no route
-- that accepts an arbitrary username to probe.
CREATE TABLE IF NOT EXISTS presence (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      TEXT NOT NULL CHECK (state IN ('online','away')),
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_expires ON presence(expires_at);

-- Aggregate-only activity heartbeat. Responses count these rows but never
-- select or expose the attached account identity.
CREATE TABLE IF NOT EXISTS online_heartbeats (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_online_heartbeats_expires
  ON online_heartbeats(expires_at);

-- Disabled-by-default authenticated staging lobbies. This is roster/invite
-- coordination only; it does not claim a realtime deterministic match relay.
CREATE TABLE IF NOT EXISTS multiplayer_lobbies (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','closed')),
  revision INTEGER NOT NULL DEFAULT 1, rules_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_expiry ON multiplayer_lobbies(expires_at);
CREATE TABLE IF NOT EXISTS multiplayer_lobby_members (
  lobby_id TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ready INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_members_user ON multiplayer_lobby_members(user_id,updated_at);
CREATE TABLE IF NOT EXISTS multiplayer_invites (
  id TEXT PRIMARY KEY, lobby_id TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, responded_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_multiplayer_invite_pending
  ON multiplayer_invites(lobby_id,to_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_multiplayer_invite_inbox
  ON multiplayer_invites(to_id,status,expires_at);

-- ----------------------------------------------------------------------------
-- MODERATION OPERATIONS FOUNDATION. This snapshot mirrors ledger migration
-- 0004. It creates no public capability and does not enable chat or realtime.
-- Retained evidence uses opaque subject_ref values; account deletion removes
-- the user_id mapping without erasing the append-only moderation record.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_subjects (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject_ref TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS moderation_cases (
  id TEXT PRIMARY KEY, report_id INTEGER UNIQUE,
  reporter_ref TEXT NOT NULL, subject_ref TEXT NOT NULL,
  evidence_snapshot TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','claimed','resolved')),
  claimed_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_queue ON moderation_cases(state,created_at,id);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_subject ON moderation_cases(subject_ref,created_at);
CREATE TABLE IF NOT EXISTS moderation_sanctions (
  id TEXT PRIMARY KEY, case_id TEXT, subject_ref TEXT NOT NULL, user_id INTEGER,
  kind TEXT NOT NULL CHECK(kind IN ('warning','suspend','ban')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  reason TEXT NOT NULL, actor_ref TEXT NOT NULL, created_at INTEGER NOT NULL,
  expires_at INTEGER, revoked_at INTEGER, revoked_by TEXT, revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_moderation_sanctions_active_user
  ON moderation_sanctions(user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_moderation_sanctions_subject
  ON moderation_sanctions(subject_ref,created_at);
CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY, sanction_id TEXT NOT NULL, appellant_ref TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','accepted','denied')),
  reason TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_at INTEGER,
  resolver_ref TEXT, resolution_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals_one_open
  ON moderation_appeals(sanction_id,appellant_ref) WHERE state='open';
CREATE INDEX IF NOT EXISTS idx_moderation_appeals_queue
  ON moderation_appeals(state,created_at,id);
CREATE TABLE IF NOT EXISTS moderation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, subject_ref TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('player','operator','system')),
  actor_ref TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
  details_json TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_events_case ON moderation_events(case_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_subject ON moderation_events(subject_ref,created_at,id);
CREATE TRIGGER IF NOT EXISTS moderation_events_no_update
BEFORE UPDATE ON moderation_events
BEGIN
  SELECT RAISE(ABORT,'moderation_events is append-only');
END;
CREATE TRIGGER IF NOT EXISTS moderation_events_no_delete
BEFORE DELETE ON moderation_events
BEGIN
  SELECT RAISE(ABORT,'moderation_events is append-only');
END;

-- Disabled-by-default match launch compatibility foundation. This records a
-- ready lobby's immutable inputs and one deterministic credential seat per
-- player; realtime command transport remains a separate, unavailable feature.
CREATE TABLE IF NOT EXISTS multiplayer_lobby_compatibility (
  lobby_id       TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lobby_revision INTEGER NOT NULL,
  build_version  TEXT NOT NULL,
  manifest_hash  TEXT NOT NULL,
  balance_hash   TEXT NOT NULL,
  rules_hash     TEXT NOT NULL,
  submitted_at   INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_compatibility_revision
  ON multiplayer_lobby_compatibility(lobby_id,lobby_revision);

CREATE TABLE IF NOT EXISTS multiplayer_matches (
  id              TEXT PRIMARY KEY,
  lobby_id        TEXT NOT NULL UNIQUE REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  launch_revision INTEGER NOT NULL,
  host_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  build_version   TEXT NOT NULL,
  manifest_hash   TEXT NOT NULL,
  balance_hash    TEXT NOT NULL,
  rules_hash      TEXT NOT NULL,
  roster_size     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_expiry
  ON multiplayer_matches(expires_at);

CREATE TABLE IF NOT EXISTS multiplayer_match_seats (
  match_id          TEXT NOT NULL REFERENCES multiplayer_matches(id) ON DELETE CASCADE,
  lobby_id          TEXT NOT NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat_number       INTEGER NOT NULL,
  build_version     TEXT NOT NULL,
  manifest_hash     TEXT NOT NULL,
  balance_hash      TEXT NOT NULL,
  rules_hash        TEXT NOT NULL,
  token_hash        TEXT UNIQUE,
  token_issued_at   INTEGER,
  token_expires_at  INTEGER,
  token_consumed_at INTEGER,
  PRIMARY KEY(match_id,user_id),
  UNIQUE(match_id,seat_number)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_match_seats_user
  ON multiplayer_match_seats(user_id,match_id);
